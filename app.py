import os
from flask import Flask, render_template, request, jsonify, session, send_from_directory
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
    duration_seconds = db.Column(db.Integer, nullable=True)  # duration in seconds

class ScoreHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    wallet_address = db.Column(db.String(50), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

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

user_states = {}

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
        logging.debug(f"Blaster Keys balance: {blaster_keys_balance}")

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

@app.route('/submit_event', methods=['POST'])
def submit_event():
    wallet_address = session.get('wallet_address')
    if not wallet_address:
        logging.error("Not authenticated")
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    event_data = request.json
    logging.debug(f"Received event data: {event_data}")

    event_type = event_data.get('type')
    score = event_data.get('score')
    timestamp = datetime.fromisoformat(event_data.get('timestamp'))

    if wallet_address not in user_states:
        user_states[wallet_address] = {
            'score': -400,
            'last_event_time': None,
            'is_game_over': False,
            'start_time': None  # Initialize start_time to None
        }

    user_state = user_states[wallet_address]

    if user_state['is_game_over'] and event_type != 'game_over':
        logging.error("Game is over for this user")
        return jsonify({"status": "error", "message": "Game is over for this user"}), 400

    if not validate_event(event_type, event_data, user_state):
        logging.error(f"Invalid event data: {event_data}")
        return jsonify({"status": "error", "message": "Invalid event data"}), 400

    update_user_state(event_type, event_data, user_state)

    if event_type == 'score_update':
        if should_store_score(user_state['score']):
            store_score_history(wallet_address, user_state['score'], timestamp)

    if event_type == 'game_over':
        # Save the game data when the game is over
        save_game_data(wallet_address, user_state)

    return jsonify({"status": "success", "score": user_state['score']})

def should_store_score(score):
    return score % 1500 == 0

def store_score_history(wallet_address, score, timestamp):
    score_entry = ScoreHistory(wallet_address=wallet_address, score=score, timestamp=timestamp)
    db.session.add(score_entry)
    db.session.commit()
    logging.debug(f"Stored score history for {wallet_address}: {score} at {timestamp}")

def validate_event(event_type, event_data, user_state):
    logging.debug(f"Validating event: {event_data}")

    if event_type not in ['score_update', 'game_over']:
        logging.error("Invalid event type")
        return False

    if event_type == 'score_update':
        score = event_data.get('score')
        if score is None:
            logging.error("Score is missing")
            return False
        if score < user_state['score']:
            logging.error("Score decreased")
            return False  # Scores should only increase

    logging.debug("Event validated successfully")
    return True

def update_user_state(event_type, event_data, user_state):
    if event_type == 'score_update':
        user_state['score'] = event_data.get('score')
    elif event_type == 'game_over':
        user_state['is_game_over'] = True
    logging.debug(f"User state updated: {user_state}")

def save_game_data(wallet_address, user_state):
    blaster_keys = session.get('blaster_keys', 0)
    existing_entry = GameData.query.filter_by(wallet_address=wallet_address).first()
    
    # Calculate duration
    duration = (datetime.utcnow() - user_state['start_time']).total_seconds()
    
    if existing_entry:
        if user_state['score'] > existing_entry.highest_score:
            existing_entry.highest_score = user_state['score']
            existing_entry.duration_seconds = int(duration)
        existing_entry.total_plays += 1
        existing_entry.last_played = datetime.utcnow()
        existing_entry.blaster_keys = blaster_keys
        db.session.commit()
        logging.debug(f"Updated GameData for wallet: {wallet_address}")
    else:
        new_game_data = GameData(
            wallet_address=wallet_address, 
            highest_score=user_state['score'], 
            total_plays=1, 
            last_played=datetime.utcnow(), 
            blaster_keys=blaster_keys,
            duration_seconds=int(duration)
        )
        db.session.add(new_game_data)
        db.session.commit()
        logging.debug(f"Added new GameData for wallet: {wallet_address}")

@app.route('/leaderboard', methods=['GET'])
def leaderboard():
    top_scores = GameData.query.order_by(GameData.highest_score.desc()).limit(10000).all()
    leaderboard_data = [{
        'wallet_address': entry.wallet_address,
        'highest_score': entry.highest_score,
        'total_plays': entry.total_plays,
        'blaster_keys': entry.blaster_keys
    } for entry in top_scores]
    return jsonify({'status': 'success', 'leaderboard': leaderboard_data})

@app.route('/start_game', methods=['POST'])
def start_game():
    wallet_address = session.get('wallet_address')
    if 'wallet_address' not in session or not session.get('has_whale_nft', False):
        return jsonify({'status': 'error', 'message': 'Not authenticated or no Whale NFT owned'}), 401

    # Reset the game state for the user
    user_states[wallet_address] = {
        'score': -400,
        'last_event_time': None,
        'is_game_over': False,
        'start_time': datetime.utcnow()  # Track the game start time
    }
    return jsonify({'status': 'success', 'message': 'Game can be started'})

@app.route('/get_blastr_key_status', methods=['POST'])
def get_blastr_key_status():
    wallet_address = session.get('wallet_address')
    if not wallet_address:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    existing_entry = GameData.query.filter_by(wallet_address=wallet_address).first()
    if existing_entry:
        blastr_keys = existing_entry.blaster_keys
        return jsonify({'status': 'success', 'blastr_keys': blastr_keys})
    else:
        return jsonify({'status': 'error', 'message': 'Wallet address not found'}), 404

@app.route('/')
def index():
    return render_template('index2.html')

@app.route('/cleanup_score_history', methods=['POST'])
def cleanup_score_history():
    wallet_entries = GameData.query.all()
    for entry in wallet_entries:
        highest_score = entry.highest_score
        wallet_address = entry.wallet_address

        # Find all score history entries that contributed to the highest score
        highest_score_entries = ScoreHistory.query.filter_by(wallet_address=wallet_address).order_by(ScoreHistory.timestamp.asc()).all()
        if highest_score_entries:
            scores_to_keep = []
            cumulative_score = -400  # Start from initial score

            for score_entry in highest_score_entries:
                cumulative_score += score_entry.score
                scores_to_keep.append(score_entry.id)
                if cumulative_score >= highest_score:
                    break

            # Delete all other score history entries for the wallet
            ScoreHistory.query.filter(ScoreHistory.wallet_address == wallet_address, ScoreHistory.id.notin_(scores_to_keep)).delete(synchronize_session=False)
            db.session.commit()
            logging.debug(f"Cleaned up score history for {wallet_address}, kept scores: {[entry.score for entry in highest_score_entries if entry.id in scores_to_keep]}")
    return jsonify({'status': 'success', 'message': 'Score history cleaned up'})

@app.route('/download/<filename>')
def download_file(filename):
    return send_from_directory(os.path.join(app.root_path, 'instance'), filename)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
