from flask import Blueprint, jsonify
from datetime import datetime
from app.socket_events.connection import connected_users

bp = Blueprint('health', __name__, url_prefix='/api')

@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'connected_users': len(connected_users),
        'timestamp': datetime.utcnow().isoformat()
    })