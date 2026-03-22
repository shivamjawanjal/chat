from flask_socketio import emit, join_room
from app.socket_events.connection import user_rooms
import logging

logger = logging.getLogger(__name__)

def handle_join_chat_room(data):
    """Join a specific chat room for private conversation"""
    try:
        user_btid = data.get('user')
        friend_btid = data.get('friend')
        
        # Create a unique room ID for the conversation
        room_id = f"chat_{min(user_btid, friend_btid)}_{max(user_btid, friend_btid)}"
        
        join_room(room_id)
        if user_btid in user_rooms:
            user_rooms[user_btid].append(room_id)
        
        emit('joined_room', {'room': room_id})
        
    except Exception as e:
        logger.error(f"Error joining chat room: {e}")
        emit('error', {'message': 'Could not join chat room'})