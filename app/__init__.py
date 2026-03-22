from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from dotenv import load_dotenv
import os
import logging

# Load environment variables
load_dotenv()

# Initialize extensions
socketio = SocketIO()

def create_app(config_class=None):
    """Application factory"""
    import os
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    app = Flask(__name__, template_folder=os.path.join(base_dir, 'templates'), static_folder=os.path.join(base_dir, 'static'))
    
    # Configure app
    if config_class:
        app.config.from_object(config_class)
    else:
        app.config.from_mapping(
            SECRET_KEY=os.environ.get('SECRET_KEY', 'dev-key-change-in-production'),
            DEBUG=os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
        )
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    # Initialize extensions
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    socketio.init_app(app, cors_allowed_origins="*")
    
    # Register blueprints
    from app.routes import auth, friends, search, health
    app.register_blueprint(auth.bp)
    app.register_blueprint(friends.bp)
    app.register_blueprint(search.bp)
    app.register_blueprint(health.bp)
    
    # Register error handlers
    register_error_handlers(app)
    
    # Register socket events
    register_socket_events()
    
    logger.info("Application initialized")
    
    @app.route('/')
    def index():
        from flask import render_template
        return render_template('index.html')
        
    return app

def register_error_handlers(app):
    """Register error handlers"""
    @app.errorhandler(404)
    def not_found(error):
        from flask import jsonify
        return jsonify({'status': 'error', 'message': 'Resource not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        from flask import jsonify
        app.logger.error(f"Internal server error: {error}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

def register_socket_events():
    """Register socket.io event handlers"""
    from app.socket_events import connection, messaging, typing, rooms
    
    # Connection handlers
    socketio.on_event('connect', connection.handle_connect)
    socketio.on_event('disconnect', connection.handle_disconnect)
    socketio.on_event('identify', connection.handle_identify)
    
    # Messaging handlers
    socketio.on_event('private_message', messaging.handle_private_message)
    socketio.on_event('message_read', messaging.handle_message_read)
    socketio.on_event('get_chat_history', messaging.handle_get_chat_history)
    socketio.on_event('exchange_public_keys', messaging.handle_key_exchange)
    
    # Typing handlers
    socketio.on_event('typing_start', typing.handle_typing_start)
    socketio.on_event('typing_stop', typing.handle_typing_stop)
    
    # Room handlers
    socketio.on_event('join_chat_room', rooms.handle_join_chat_room)