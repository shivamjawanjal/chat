from flask import Blueprint, request, jsonify
from app.models.user import User
from app.config import get_database
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('friends', __name__, url_prefix='/api')
db = get_database()
users_collection = db['users']
messages_collection = db['messages']

@bp.route('/friends/<btid>', methods=['GET'])
def get_friends(btid):
    """Get user's friends list with statuses"""
    try:
        user = User.find_by_btid(btid)
        if not user:
            return jsonify({'status': 'error', 'message': 'User not found'}), 404
        
        from app.socket_events.connection import connected_users
        
        friends_list = []
        for friend_btid in user.get('friends', []):
            friend_data = User.find_by_btid(friend_btid)
            if friend_data:
                is_online = friend_btid in connected_users
                friends_list.append({
                    'btid': friend_btid,
                    'is_online': is_online,
                    'status': friend_data.get('status', 'Offline'),
                    'last_seen': friend_data.get('last_seen'),
                    'profile': friend_data.get('profile', {})
                })
        
        return jsonify({
            'friends': friends_list,
            'requests': user.get('friend_requests', []),
            'blocked': user.get('blocked', [])
        })
        
    except Exception as e:
        logger.error(f"Error getting friends: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/friend/request', methods=['POST'])
def send_friend_request():
    """Send a friend request"""
    try:
        data = request.get_json()
        sender = data.get('sender')
        target = data.get('target')
        
        if sender == target:
            return jsonify({'status': 'error', 'message': 'Cannot add yourself as friend'}), 400
        
        target_user = User.find_by_btid(target)
        if not target_user:
            return jsonify({'status': 'error', 'message': 'User not found'}), 404
        
        # Check if already friends
        if sender in target_user.get('friends', []):
            return jsonify({'status': 'error', 'message': 'Already friends'}), 400
        
        # Check if blocked
        if sender in target_user.get('blocked', []):
            return jsonify({'status': 'error', 'message': 'User has blocked you'}), 403
        
        # Check if request already sent
        if sender in target_user.get('friend_requests', []):
            return jsonify({'status': 'error', 'message': 'Friend request already sent'}), 400
        
        # Add friend request
        users_collection.update_one(
            {'btid': target},
            {'$addToSet': {'friend_requests': sender}}
        )
        
        # Notify target if online
        from app import socketio
        from app.socket_events.connection import connected_users
        
        if target in connected_users:
            socketio.emit('friend_request_received', {
                'sender': sender,
                'timestamp': datetime.utcnow().isoformat()
            }, room=connected_users[target])
        
        logger.info(f"Friend request sent: {sender} -> {target}")
        return jsonify({'status': 'success', 'message': 'Friend request sent'})
        
    except Exception as e:
        logger.error(f"Error sending friend request: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/friend/accept', methods=['POST'])
def accept_friend_request():
    """Accept a friend request"""
    try:
        data = request.get_json()
        user_btid = data.get('user')
        friend_btid = data.get('friend')
        
        # Update both users' friend lists
        users_collection.update_one(
            {'btid': user_btid},
            {
                '$pull': {'friend_requests': friend_btid},
                '$addToSet': {'friends': friend_btid}
            }
        )
        
        users_collection.update_one(
            {'btid': friend_btid},
            {'$addToSet': {'friends': user_btid}}
        )
        
        # Notify both users if online
        from app import socketio
        from app.socket_events.connection import connected_users
        
        for user in [user_btid, friend_btid]:
            if user in connected_users:
                socketio.emit('friend_accepted', {
                    'friend': friend_btid if user == user_btid else user_btid,
                    'timestamp': datetime.utcnow().isoformat()
                }, room=connected_users[user])
        
        logger.info(f"Friend request accepted: {friend_btid} -> {user_btid}")
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error accepting friend request: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/friend/reject', methods=['POST'])
def reject_friend_request():
    """Reject a friend request"""
    try:
        data = request.get_json()
        user_btid = data.get('user')
        friend_btid = data.get('friend')
        
        users_collection.update_one(
            {'btid': user_btid},
            {'$pull': {'friend_requests': friend_btid}}
        )
        
        logger.info(f"Friend request rejected: {friend_btid} -> {user_btid}")
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error rejecting friend request: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/friend/remove', methods=['POST'])
def remove_friend():
    """Remove a friend"""
    try:
        data = request.get_json()
        user_btid = data.get('user')
        friend_btid = data.get('friend')
        
        # Remove from both users' friend lists
        users_collection.update_one(
            {'btid': user_btid},
            {'$pull': {'friends': friend_btid}}
        )
        
        users_collection.update_one(
            {'btid': friend_btid},
            {'$pull': {'friends': user_btid}}
        )
        
        logger.info(f"Friend removed: {user_btid} removed {friend_btid}")
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error removing friend: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/friend/block', methods=['POST'])
def block_user():
    """Block a user"""
    try:
        data = request.get_json()
        user_btid = data.get('user')
        target_btid = data.get('target')
        
        # Block the user and remove from friends/requests
        users_collection.update_one(
            {'btid': user_btid},
            {
                '$addToSet': {'blocked': target_btid},
                '$pull': {
                    'friends': target_btid,
                    'friend_requests': target_btid
                }
            }
        )
        
        # Remove from target's friends list as well
        users_collection.update_one(
            {'btid': target_btid},
            {'$pull': {'friends': user_btid}}
        )
        
        # Clear any pending messages between them
        messages_collection.delete_many({
            '$or': [
                {'sender': user_btid, 'recipient': target_btid},
                {'sender': target_btid, 'recipient': user_btid}
            ]
        })
        
        logger.info(f"User blocked: {user_btid} blocked {target_btid}")
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error blocking user: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/friend/unblock', methods=['POST'])
def unblock_user():
    """Unblock a user"""
    try:
        data = request.get_json()
        user_btid = data.get('user')
        target_btid = data.get('target')
        
        users_collection.update_one(
            {'btid': user_btid},
            {'$pull': {'blocked': target_btid}}
        )
        
        logger.info(f"User unblocked: {user_btid} unblocked {target_btid}")
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error unblocking user: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500