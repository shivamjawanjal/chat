from flask import Blueprint, request, jsonify
from app.models.user import User
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('search', __name__, url_prefix='/api')

@bp.route('/search', methods=['GET'])
def search_users():
    """Search for users by BTID"""
    try:
        query = request.args.get('q', '').strip()
        current_user = request.args.get('current_user', '')
        
        if not query or len(query) < 2:
            return jsonify([])
        
        # Search for users matching the query
        matches = User.search(query, current_user)
        
        # Add online status
        from app.socket_events.connection import connected_users
        for match in matches:
            match['is_online'] = match['btid'] in connected_users
        
        return jsonify(matches)
        
    except Exception as e:
        logger.error(f"Error searching users: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500