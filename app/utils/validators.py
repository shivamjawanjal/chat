import re

def validate_btid(btid):
    """Validate BTID format"""
    if not btid or len(btid) < 3:
        return False, "BTID must be at least 3 characters"
    if not re.match(r'^[a-zA-Z0-9_]+$', btid):
        return False, "BTID can only contain letters, numbers, and underscores"
    return True, ""

def validate_password(password):
    """Validate password strength"""
    if not password or len(password) < 6:
        return False, "Password must be at least 6 characters"
    return True, ""

def validate_message(message):
    """Validate message content"""
    if not message or len(message) > 10000:
        return False, "Message must be between 1 and 10000 characters"
    return True, ""