from flask_socketio import emit
from app.socket_events.connection import connected_users
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def handle_typing_start(data):
    """Notify that user started typing"""
    try:
        sender = data.get('sender')
        recipient = data.get('recipient')
        
        if recipient in connected_users:
            emit('friend_typing_start', {
                'sender': sender,
                'timestamp': datetime.utcnow().isoformat()
            }, room=connected_users[recipient])
            
    except Exception as e:
        logger.error(f"Error handling typing start: {e}")

def handle_typing_stop(data):
    """Notify that user stopped typing"""
    try:
        sender = data.get('sender')
        recipient = data.get('recipient')
        
        if recipient in connected_users:
            emit('friend_typing_stop', {
                'sender': sender,
                'timestamp': datetime.utcnow().isoformat()
            }, room=connected_users[recipient])
            
    except Exception as e:
        logger.error(f"Error handling typing stop: {e}")