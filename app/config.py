import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
    DEBUG = False
    TESTING = False
    
class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    ENV = 'development'
    
class ProductionConfig(Config):
    """Production configuration"""
    ENV = 'production'
    
class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True
    ENV = 'testing'

def get_database():
    """Get database connection"""
    from pymongo import MongoClient
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    mongo_uri = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/')
    db_name = os.environ.get('DB_NAME', 'chat_app')
    
    # Secure logging of URI
    masked_uri = mongo_uri.split('@')[-1] if '@' in mongo_uri else 'local'
    logger.info(f"Attempting MongoDB connection to host: {masked_uri} / DB: {db_name}")
    
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        # Force a small check to see if connection is alive (optional but good for diagnostics)
        client.admin.command('ping')
        logger.info("MongoDB connection successful")
        return client[db_name]
    except Exception as e:
        logger.error(f"MongoDB connection failed: {str(e)}")
        # Don't re-raise immediately, just return the client object as per original code flow
        # but the original code didn't check connection.
        return client[db_name]