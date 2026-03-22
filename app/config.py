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
    
    mongo_uri = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/')
    db_name = os.environ.get('DB_NAME', 'chat_app')
    
    client = MongoClient(mongo_uri)
    return client[db_name]