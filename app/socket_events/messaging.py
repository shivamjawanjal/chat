from flask_socketio import emit
from app.models.user import User
from app.config import get_database
from datetime import datetime
from bson import ObjectId
import uuid
import logging

logger = logging.getLogger(__name__)
db = get_database()
messages_collection = db['messages']
users_collection = db['users']

from app.socket_events.connection import connected_users

def handle_private_message(data):
    """Handle private message with E2EE"""
    try:
        sender = data.get('sender')
        recipient = data.get('recipient')
        encrypted_msg = data.get('msg')
        msg_id = data.get('msg_id', str(uuid.uuid4()))
        
        # Check if blocked
        recipient_user = User.find_by_btid(recipient)
        if recipient_user and sender in recipient_user.get('blocked', []):
            emit('message_blocked', {'msg_id': msg_id})
            return
        
        message_data = {
            '_id': ObjectId(),
            'msg_id': msg_id,
            'sender': sender,
            'recipient': recipient,
            'msg': encrypted_msg,
            'created_at': datetime.utcnow(),
            'delivered': False,
            'read': False
        }
        
        # Store message
        messages_collection.insert_one(message_data)
        
        # Send if recipient is online
        if recipient in connected_users:
            emit('receive_private_message', {
                'msg_id': msg_id,
                'sender': sender,
                'msg': encrypted_msg,
                'timestamp': message_data['created_at'].isoformat()
            }, room=connected_users[recipient])
            
            # Mark as delivered
            messages_collection.update_one(
                {'_id': message_data['_id']},
                {'$set': {'delivered': True, 'delivered_at': datetime.utcnow()}}
            )
            
            emit('message_sent', {
                'msg_id': msg_id,
                'status': 'delivered'
            })
        else:
            emit('message_sent', {
                'msg_id': msg_id,
                'status': 'stored'
            })
            
    except Exception as e:
        logger.error(f"Error sending private message: {e}")
        emit('error', {'message': 'Could not send message'})

def handle_message_read(data):
    """Mark message as read"""
    try:
        reader = data.get('reader')
        sender = data.get('sender')
        msg_id = data.get('msg_id')
        
        # Update message as read
        messages_collection.update_one(
            {'msg_id': msg_id},
            {'$set': {'read': True, 'read_at': datetime.utcnow()}}
        )
        
        # Notify sender if online
        if sender in connected_users:
            emit('message_read_receipt', {
                'msg_id': msg_id,
                'reader': reader,
                'timestamp': datetime.utcnow().isoformat()
            }, room=connected_users[sender])
            
    except Exception as e:
        logger.error(f"Error marking message as read: {e}")

def handle_get_chat_history(data):
    """Retrieve chat history between two users"""
    try:
        user1 = data.get('user1')
        user2 = data.get('user2')
        limit = data.get('limit', 50)
        
        messages = list(messages_collection.find({
            '$or': [
                {'sender': user1, 'recipient': user2},
                {'sender': user2, 'recipient': user1}
            ]
        }).sort('created_at', -1).limit(limit))
        
        # Format messages for sending
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                'msg_id': msg['msg_id'],
                'sender': msg['sender'],
                'recipient': msg['recipient'],
                'msg': msg['msg'],
                'timestamp': msg['created_at'].isoformat(),
                'read': msg.get('read', False),
                'delivered': msg.get('delivered', False)
            })
        
        emit('chat_history', {
            'user1': user1,
            'user2': user2,
            'messages': formatted_messages[::-1]  # Return in chronological order
        })
        
    except Exception as e:
        logger.error(f"Error getting chat history: {e}")
        emit('error', {'message': 'Could not retrieve chat history'})

def handle_key_exchange(data):
    """Exchange public keys for E2EE"""
    try:
        sender = data.get('sender')
        recipient = data.get('recipient')
        public_key = data.get('public_key')
        
        if recipient in connected_users:
            emit('receive_public_key', {
                'sender': sender,
                'public_key': public_key,
                'timestamp': datetime.utcnow().isoformat()
            }, room=connected_users[recipient])
            
    except Exception as e:
        logger.error(f"Error exchanging keys: {e}")