from datetime import datetime
from app.config import get_database
import logging

logger = logging.getLogger(__name__)
db = get_database()
users_collection = db['users']

class User:
    """User model for database operations"""
    
    @staticmethod
    def find_by_btid(btid):
        """Find user by BTID"""
        try:
            return users_collection.find_one({'btid': btid})
        except Exception as e:
            logger.error(f"Database error: {e}")
            return None
    
    @staticmethod
    def create(btid, password):
        """Create a new user"""
        try:
            user = {
                'btid': btid,
                'password': password,  # In production, hash this!
                'friends': [],
                'friend_requests': [],
                'blocked': [],
                'status': 'Offline',
                'created_at': datetime.utcnow(),
                'last_seen': datetime.utcnow(),
                'profile': {
                    'avatar': None,
                    'bio': ''
                }
            }
            users_collection.insert_one(user)
            return user
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return None
    
    @staticmethod
    def update(btid, update_data):
        """Update user data"""
        try:
            return users_collection.update_one({'btid': btid}, update_data)
        except Exception as e:
            logger.error(f"Error updating user: {e}")
            return None
    
    @staticmethod
    def authenticate(btid, password):
        """Authenticate user"""
        return users_collection.find_one({'btid': btid, 'password': password})
    
    @staticmethod
    def search(query, exclude_user=None):
        """Search for users"""
        try:
            filter_query = {'btid': {'$regex': query, '$options': 'i'}}
            if exclude_user:
                filter_query['btid'] = {'$ne': exclude_user, '$regex': query, '$options': 'i'}
            
            return list(users_collection.find(
                filter_query,
                {'_id': 0, 'password': 0, 'friend_requests': 0, 'blocked': 0}
            ).limit(20))
        except Exception as e:
            logger.error(f"Error searching users: {e}")
            return []
    
    @staticmethod
    def get_friends(btid):
        """Get user's friends list"""
        user = User.find_by_btid(btid)
        if not user:
            return []
        
        friends_list = []
        for friend_btid in user.get('friends', []):
            friend_data = User.find_by_btid(friend_btid)
            if friend_data:
                friends_list.append(friend_data)
        
        return friends_list