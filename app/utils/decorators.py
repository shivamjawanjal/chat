from functools import wraps
from flask import request, jsonify
import logging

logger = logging.getLogger(__name__)

def require_auth(f):
    """Decorator to check if user is authenticated"""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Get token from headers
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'status': 'error', 'message': 'No token provided'}), 401
        
        # In production, validate JWT token here
        # token = auth_header.split(' ')[1]
        
        return f(*args, **kwargs)
    return decorated

def require_websocket_auth(f):
    """Decorator to check if socket user is authenticated"""
    @wraps(f)
    def decorated(*args, **kwargs):
        # This is handled at the socket level
        return f(*args, **kwargs)
    return decorated