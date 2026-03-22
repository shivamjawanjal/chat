from flask import Blueprint, request, jsonify
from app.models.user import User
from datetime import datetime
import uuid
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('auth', __name__, url_prefix='/api')

@bp.route('/createuser', methods=['POST'])
def create_user():
    """Create a new user account"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'No data provided'}), 400
            
        btid = data.get('btid', '').strip()
        password = data.get('password', '').strip()
        
        if not btid or not password:
            return jsonify({'status': 'error', 'message': 'BTID and password required'}), 400
        
        if len(password) < 6:
            return jsonify({'status': 'error', 'message': 'Password must be at least 6 characters'}), 400
            
        if User.find_by_btid(btid):
            return jsonify({'status': 'error', 'message': 'User already exists'}), 409
        
        user = User.create(btid, password)
        if not user:
            return jsonify({'status': 'error', 'message': 'Failed to create user'}), 500
        
        logger.info(f"New user created: {btid}")
        return jsonify({'status': 'success', 'message': 'User created successfully'}), 201
        
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/login', methods=['POST'])
def login():
    """Authenticate user"""
    try:
        data = request.get_json()
        btid = data.get('btid', '').strip()
        password = data.get('password', '').strip()
        
        user = User.authenticate(btid, password)
        if not user:
            return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
        
        # Update last seen
        User.update(btid, {'$set': {'last_seen': datetime.utcnow()}})
        
        # Generate session token
        session_token = str(uuid.uuid4())
        
        return jsonify({
            'status': 'success',
            'user': {
                'btid': btid,
                'friends_count': len(user.get('friends', [])),
                'pending_requests': len(user.get('friend_requests', []))
            },
            'session_token': session_token
        })
        
    except Exception as e:
        logger.error(f"Error during login: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/changepassword', methods=['POST'])
def change_password():
    """Change user password"""
    try:
        data = request.get_json()
        btid = data.get('btid')
        old_password = data.get('old_password')
        new_password = data.get('new_password')
        
        if not new_password or len(new_password) < 6:
            return jsonify({'status': 'error', 'message': 'New password must be at least 6 characters'}), 400
        
        result = User.update(
            {'btid': btid, 'password': old_password},
            {'$set': {'password': new_password}}
        )
        
        if result.matched_count == 0:
            return jsonify({'status': 'error', 'message': 'Invalid current password'}), 401
        
        logger.info(f"Password changed for user: {btid}")
        return jsonify({'status': 'success', 'message': 'Password updated successfully'})
        
    except Exception as e:
        logger.error(f"Error changing password: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@bp.route('/user/<btid>/status', methods=['PUT'])
def update_status(btid):
    """Update user's online status"""
    try:
        data = request.get_json()
        new_status = data.get('status', 'Online')
        
        if new_status not in ['Online', 'Away', 'Do Not Disturb', 'Offline']:
            return jsonify({'status': 'error', 'message': 'Invalid status'}), 400
        
        User.update(
            {'btid': btid},
            {'$set': {'status': new_status, 'last_seen': datetime.utcnow()}}
        )
        
        # Broadcast status change to friends (handled by socket)
        from app import socketio
        from app.socket_events.connection import connected_users
        
        user = User.find_by_btid(btid)
        if user:
            for friend in user.get('friends', []):
                if friend in connected_users:
                    socketio.emit('friend_status_changed', {
                        'btid': btid,
                        'status': new_status,
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=connected_users[friend])
        
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error updating status: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500