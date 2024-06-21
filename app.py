import os
from flask import Flask, render_template, request, jsonify, session
from web3 import Web3
from flask_sqlalchemy import SQLAlchemy
from flask_session import Session
from flask_migrate import Migrate
from datetime import datetime, timedelta
from eth_account.messages import encode_defunct
from flask_cors import CORS
import logging

app = Flask(__name__)
CORS(app)

# Use DATABASE_URL for Heroku Postgres, fallback to sqlite for local development
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///gamedata.db').replace('postgres://', 'postgresql+pg8000://')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'your_secret_key'
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Database Models
class GameData(db.Model):
    wallet_address = db.Column(db.String(50), primary_key=True)
    highest_score = db.Column(db.Integer, nullable=False)
    total_plays = db.Column(db.Integer, default=0)
    last_played = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    blaster_keys = db.Column(db.Integer, nullable=False)

# Connect to the Ethereum network
web3 = Web3(Web3.HTTPProvider('https://rpc.blast.io'))

# Define the NFT contract addresses and ABIs
NFT_CONTRACT_ADDRESS = Web3.to_checksum_address('0xd540780eBDfcdEe74eA39DcA36026a979a01167F')
BLASTER_KEYS_CONTRACT_ADDRESS = Web3.to_checksum_address('0x6600B28199bD808EDc96111f0800A415FcCaDDC0')

NFT_CONTRACT_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]

# Create the contract instances
nft_contract = web3.eth.contract(address=NFT_CONTRACT_ADDRESS, abi=NFT_CONTRACT_ABI)
blaster_keys_contract = web3.eth.contract(address=BLASTER_KEYS_CONTRACT_ADDRESS, abi=NFT_CONTRACT_ABI)

@app.route('/check_nft', methods=['POST'])
def check_nft():
    data = request.json
    account = data['account']
    signature = data['signature']
    message = data['message']

    logging.debug(f"Received check_nft request for account: {account}")

    # Recover the address from the signed message
    message = encode_defunct(text=message)
    recovered_address = web3.eth.account.recover_message(message, signature=signature)

    if recovered_address.lower() == account.lower():
        # Check NFT ownership
        whale_nft_balance = nft_contract.functions.balanceOf(account).call()
        blaster_keys_balance = blaster_keys_contract.functions.balanceOf(account).call()

        logging.debug(f"Whale NFT balance: {whale_nft_balance}")
        logging.debug(f"Blastr Keys balance: {blaster_keys_balance}")

        if whale_nft_balance > 0:
            session['wallet_address'] = account
            session['has_whale_nft'] = True
            session['blaster_keys'] = blaster_keys_balance

            # Store Blastr Keys in the database
            existing_entry = GameData.query.filter_by(wallet_address=account).first()
            if existing_entry:
                existing_entry.blaster_keys = blaster_keys_balance
                db.session.commit()
            else:
                new_game_data = GameData(wallet_address=account, highest_score=0, total_plays=0, last_played=datetime.utcnow(), blaster_keys=blaster_keys_balance)
                db.session.add(new_game_data)
                db.session.commit()

            logging.debug(f"GameData updated for account: {account}")
            return jsonify({'status': 'success', 'blaster_keys': blaster_keys_balance})
        else:
            return jsonify({'status': 'error', 'message': 'No Whale NFT owned'})
    else:
        return jsonify({'status': 'error', 'message': 'Signature verification failed'})

@app.route('/check_nft_balance', methods=['POST'])
def check_nft_balance():
    data = request.json
    account = data['account']
    wallet_address = session.get('wallet_address')
    
    if not wallet_address or wallet_address.lower() != account.lower():
        return jsonify({'status': 'error', 'message': 'Wallet address mismatch'}), 401

    whale_nft_balance = nft_contract.functions.balanceOf(wallet_address).call()
    blaster_keys_balance = blaster_keys_contract.functions.balanceOf(wallet_address).call()

    if whale_nft_balance > 0:
        session['has_whale_nft'] = True
        session['blaster_keys'] = blaster_keys_balance

        # Update Blastr Keys in the database
        existing_entry = GameData.query.filter_by(wallet_address=wallet_address).first()
        if existing_entry:
            existing_entry.blaster_keys = blaster_keys_balance
            db.session.commit()

        return jsonify({'status': 'success', 'blaster_keys': blaster_keys_balance})
    else:
        session['has_whale_nft'] = False
        return jsonify({'status': 'error', 'message': 'No Whale NFT owned'})

@app.route('/submit_score', methods=['POST'])
def submit_score():
    wallet_address = session.get('wallet_address')
    blaster_keys = session.get('blaster_keys', 0)
    if not wallet_address:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    data = request.get_json()
    score = data.get('score')
    timestamp = datetime.fromisoformat(data.get('timestamp'))

    if not score:
        return jsonify({'status': 'error', 'message': 'Invalid data'}), 400

    try:
        # Check play count in the last 24 hours
        one_day_ago = datetime.utcnow() - timedelta(hours=24)
        play_count = GameData.query.filter(
            GameData.wallet_address == wallet_address,
            GameData.last_played > one_day_ago
        ).count()

        max_plays_per_day = 5  # Define your limit here

        if play_count >= max_plays_per_day:
            return jsonify({'status': 'error', 'message': 'Play limit reached'}), 429

        # Update score and play count
        existing_entry = GameData.query.filter_by(wallet_address=wallet_address).first()
        if existing_entry:
            if score > existing_entry.highest_score:
                existing_entry.highest_score = score
            existing_entry.total_plays += 1
            existing_entry.last_played = timestamp
            existing_entry.blaster_keys = blaster_keys
            db.session.commit()
            logging.debug(f"Updated GameData for wallet: {wallet_address}")
        else:
            new_game_data = GameData(wallet_address=wallet_address, highest_score=score, total_plays=1, last_played=timestamp, blaster_keys=blaster_keys)
            db.session.add(new_game_data)
            db.session.commit()
            logging.debug(f"Added new GameData for wallet: {wallet_address}")

        return jsonify({'status': 'success', 'message': 'Score submitted'})
    
    except Exception as e:
        logging.error(f"Error submitting score: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/leaderboard', methods=['GET'])
def leaderboard():
    top_scores = GameData.query.order_by(GameData.highest_score.desc()).limit(1000).all()
    leaderboard_data = [{
        'wallet_address': entry.wallet_address,
        'highest_score': entry.highest_score,
        'total_plays': entry.total_plays,
        'blaster_keys': entry.blaster_keys
    } for entry in top_scores]
    return jsonify({'status': 'success', 'leaderboard': leaderboard_data})

@app.route('/start_game', methods=['POST'])
def start_game():
    if 'wallet_address' not in session or not session.get('has_whale_nft', False):
        return jsonify({'status': 'error', 'message': 'Not authenticated or no Whale NFT owned'}), 401
    
    # Additional game start logic if needed
    
    return jsonify({'status': 'success', 'message': 'Game can be started'})

@app.route('/get_blastr_key_status', methods=['POST'])
def get_blastr_key_status():
    wallet_address = session.get('wallet_address')
    if not wallet_address:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    existing_entry = GameData.query.filter_by(wallet_address=wallet_address).first()
    if existing_entry:
        blastr_keys = existing_entry.blaster_keys
        return jsonify({'status': 'success', 'blaster_keys': blastr_keys})
    else:
        return jsonify({'status': 'error', 'message': 'Wallet address not found'}), 404

@app.route('/')
def index():
    return render_template('index2.html')

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
