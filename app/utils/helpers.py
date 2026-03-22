from datetime import datetime

def format_user_response(user):
    """Format user data for API response"""
    return {
        'btid': user.get('btid'),
        'status': user.get('status', 'Offline'),
        'last_seen': user.get('last_seen'),
        'profile': user.get('profile', {}),
        'created_at': user.get('created_at')
    }

def sanitize_input(text):
    """Sanitize user input"""
    if not text:
        return ""
    # Remove any potentially harmful characters
    return text.strip()

def format_timestamp(dt):
    """Format datetime for JSON response"""
    if isinstance(dt, datetime):
        return dt.isoformat()
    return dt