from flask_socketio import emit, join_room, leave_room
from app.models.user import User
from app.config import get_database
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
db = get_database()
users_collection = db['users']
messages_collection = db['messages']

# In-memory stores
connected_users = {}  # {btid: sid}
user_rooms = {}  # {btid: [rooms]}

def handle_connect():
    """Handle client connection"""
    logger.info(f"Client connected: {request.sid}")
    emit('connection_ack', {'status': 'connected', 'sid': request.sid})

def handle_disconnect():
    """Handle client disconnection"""
    from flask import request
    
    disconnected_user = None
    for btid, sid in list(connected_users.items()):
        if sid == request.sid:
            disconnected_user = btid
            break
    
    if disconnected_user:
        # Remove from connected users
        del connected_users[disconnected_user]
        
        # Clean up user rooms
        if disconnected_user in user_rooms:
            for room in user_rooms[disconnected_user]:
                leave_room(room)
            del user_rooms[disconnected_user]
        
        # Update status in database
        users_collection.update_one(
            {'btid': disconnected_user},
            {'$set': {'status': 'Offline', 'last_seen': datetime.utcnow()}}
        )
        
        # Notify friends
        user = User.find_by_btid(disconnected_user)
        if user:
            for friend in user.get('friends', []):
                if friend in connected_users:
                    emit('friend_offline', {
                        'btid': disconnected_user,
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=connected_users[friend])
        
        logger.info(f"User disconnected: {disconnected_user}")

def handle_identify(data):
    """Identify the user and set up their connection"""
    from flask import request
    
    try:
        btid = data.get('btid')
        if not btid:
            emit('error', {'message': 'No BTID provided'})
            return
        
        # Check if user exists
        user = User.find_by_btid(btid)
        if not user:
            emit('error', {'message': 'User not found'})
            return
        
        # Store connection
        connected_users[btid] = request.sid
        user_rooms[btid] = []
        
        # Update status
        users_collection.update_one(
            {'btid': btid},
            {'$set': {'status': 'Online', 'last_seen': datetime.utcnow()}}
        )
        
        # Join user's personal room for direct messages
        join_room(f"user_{btid}")
        user_rooms[btid].append(f"user_{btid}")
        
        # Notify friends that user is online
        for friend in user.get('friends', []):
            if friend in connected_users:
                emit('friend_online', {
                    'btid': btid,
                    'timestamp': datetime.utcnow().isoformat()
                }, room=connected_users[friend])
        
        # Send any pending messages
        pending_messages = list(messages_collection.find({
            'recipient': btid,
            'delivered': False
        }).sort('created_at', 1))
        
        for msg in pending_messages:
            emit('receive_private_message', {
                'msg_id': str(msg['_id']),
                'sender': msg['sender'],
                'msg': msg['msg'],
                'timestamp': msg['created_at'].isoformat()
            })
            
            # Mark as delivered
            messages_collection.update_one(
                {'_id': msg['_id']},
                {'$set': {'delivered': True, 'delivered_at': datetime.utcnow()}}
            )
        
        emit('authenticated', {
            'status': 'success',
            'user': {
                'btid': btid,
                'friends_count': len(user.get('friends', [])),
                'pending_requests': len(user.get('friend_requests', []))
            }
        })
        
        logger.info(f"User identified and authenticated: {btid}")
        
    except Exception as e:
        logger.error(f"Error in identify handler: {e}")
        emit('error', {'message': 'Internal server error'})