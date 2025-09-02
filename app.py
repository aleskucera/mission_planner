import os
import re
import select
import shutil
import subprocess
import tempfile
import threading
import time
from uuid import uuid4

from dotenv import load_dotenv
from flask import Blueprint
from flask import Flask
from flask import jsonify
from flask import render_template
from flask import request


class WormholeManager:
    def __init__(self):
        self.active_transfers = {}
        self.app = None
        if shutil.which("wormhole") is None:
            raise RuntimeError(
                "'wormhole' command not found. Please install magic-wormhole."
            )

    def init_app(self, app):
        self.app = app

    def create_transfer(self, gpx_data):
        transfer_id = str(uuid4())
        temp_dir = tempfile.mkdtemp()
        file_path = os.path.join(temp_dir, "path.gpx")

        with open(file_path, "w") as f:
            f.write(gpx_data)

        cmd = ["wormhole", "send", file_path]
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env=env,
            )
        except Exception as e:
            shutil.rmtree(temp_dir)
            raise RuntimeError(f"Failed to start wormhole process: {e}")

        # We need the app context to log this line:
        with self.app.app_context():
            self.app.logger.info(
                f"Starting wormhole transfer {transfer_id}: {' '.join(cmd)}"
            )
            self.app.logger.info(
                f"Process ID for transfer {transfer_id}: {process.pid}"
            )

        self.active_transfers[transfer_id] = {
            "process": process,
            "temp_dir": temp_dir,
            "start_time": time.time(),
            "status": "running",
            "code": None,
        }

        # Pass the transfer_id to the thread
        threading.Thread(
            target=self._capture_wormhole_code_thread, args=(transfer_id,), daemon=True
        ).start()
        return transfer_id

    def _capture_wormhole_code_thread(self, transfer_id):
        """This function runs in a background thread."""
        # It needs to establish its own app context to use the logger.
        with self.app.app_context():
            transfer_info = self.active_transfers.get(transfer_id)
            if not transfer_info:
                self.app.logger.error(
                    f"Thread started for a non-existent transfer_id: {transfer_id}"
                )
                return

            process = transfer_info["process"]
            wormhole_code = None
            errors = []

            try:
                # This loop is directly from your proven implementation
                while True:
                    readable, _, _ = select.select(
                        [process.stdout, process.stderr], [], [], 0.1
                    )

                    for stream in readable:
                        line = stream.readline().strip()
                        if line:
                            match = re.search(r"Wormhole code is: (\S+-\S+-\S+)", line)
                            if match:
                                wormhole_code = match.group(1)
                                self.app.logger.info(
                                    f"Wormhole code captured for transfer {transfer_id}: {wormhole_code}"
                                )
                            elif stream == process.stderr:
                                self.app.logger.warning(
                                    f"Wormhole stderr ({transfer_id}): {line}"
                                )
                                errors.append(line)

                    if wormhole_code:
                        transfer_info["code"] = wormhole_code
                        break  # Exit the loop once code is found

                    if process.poll() is not None:
                        self.app.logger.warning(
                            f"Process for transfer {transfer_id} ended before code was captured."
                        )
                        break

                # Wait for the process to complete or timeout
                process.wait(timeout=60)
                transfer_info["status"] = (
                    "completed" if process.returncode == 0 else "failed"
                )

            except Exception as e:
                self.app.logger.error(
                    f"Error in wormhole thread for {transfer_id}: {e}"
                )
                transfer_info["status"] = "failed"
                if process.poll() is None:
                    process.kill()
            finally:
                # Cleanup runs regardless of success or failure
                self._cleanup_transfer(transfer_id)

    def get_transfer_code(self, transfer_id, timeout=10):
        """Waits for the background thread to find the code."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if transfer_id in self.active_transfers and self.active_transfers[
                transfer_id
            ].get("code"):
                return self.active_transfers[transfer_id]["code"]
            time.sleep(0.1)
        return None

    def cancel_transfer(self, transfer_id):
        with self.app.app_context():
            if transfer_id not in self.active_transfers:
                return False, "Invalid or unknown transfer ID"

            self.app.logger.info(f"Cancelling wormhole transfer {transfer_id}")
            process = self.active_transfers[transfer_id]["process"]
            if process.poll() is None:
                process.kill()

            # The finally block in the thread will handle cleanup
            self.active_transfers[transfer_id]["status"] = "cancelled"
            return True, "Transfer cancelled"

    def _cleanup_transfer(self, transfer_id):
        # This is now only called from the background thread, which already has context
        transfer = self.active_transfers.pop(transfer_id, None)
        if transfer and transfer.get("temp_dir"):
            try:
                shutil.rmtree(transfer["temp_dir"])
                self.app.logger.info(
                    f"Cleaned up temp directory for transfer {transfer_id}"
                )
            except Exception as e:
                self.app.logger.error(f"Error cleaning temp dir for {transfer_id}: {e}")


# Create a single instance for the application
wormhole_manager_instance = WormholeManager()

# Create API blueprint
api_bp = Blueprint("api", __name__)


@api_bp.route("/create_wormhole", methods=["POST"])
def create_wormhole():
    gpx_data = request.json.get("gpx")
    if not gpx_data:
        return jsonify({"success": False, "message": "No GPX data provided"}), 400

    try:
        transfer_id = wormhole_manager_instance.create_transfer(gpx_data)
        code = wormhole_manager_instance.get_transfer_code(transfer_id, timeout=15)

        if code:
            return jsonify({"success": True, "code": code, "transfer_id": transfer_id})
        else:
            logger = wormhole_manager_instance.app.logger
            logger.error(f"Failed to get wormhole code for transfer {transfer_id}")
            wormhole_manager_instance.cancel_transfer(transfer_id)
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Failed to capture wormhole code in time",
                    }
                ),
                500,
            )

    except Exception as e:
        logger = wormhole_manager_instance.app.logger
        logger.error(f"Error creating wormhole: {e}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500


@api_bp.route("/cancel_wormhole", methods=["POST"])
def cancel_wormhole():
    transfer_id = request.json.get("transfer_id")
    success, message = wormhole_manager_instance.cancel_transfer(transfer_id)
    return jsonify({"success": success, "message": message})


def create_app():
    """Application factory."""
    app = Flask(__name__, static_folder="static", template_folder="templates")

    # Initialize the wormhole manager with the app instance
    wormhole_manager_instance.init_app(app)

    # Register the main API blueprint
    app.register_blueprint(api_bp, url_prefix="/api")

    @app.route("/")
    def index():
        api_key_thunderforest = os.getenv("THUNDERFOREST_API_KEY")
        api_key_seznam = os.getenv("SEZNAM_API_KEY")
        return render_template("index.html", apikey_thunderforest=api_key_thunderforest, apikey_seznam=api_key_seznam)

    return app


load_dotenv()
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
