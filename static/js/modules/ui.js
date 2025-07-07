function showDialog({ title, message, body, closeText = "Close", onclose }) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const content = document.createElement("div");
  content.className = "dialog-content";

  if (title) {
    const titleEl = document.createElement("h2");
    titleEl.textContent = title;
    content.appendChild(titleEl);
  }

  if (message) {
    const messageEl = document.createElement("p");
    messageEl.innerHTML = message;
    content.appendChild(messageEl);
  }

  if (body) {
    content.appendChild(body);
  }

  const closeButton = document.createElement("button");
  closeButton.className = "dialog-close-btn";
  closeButton.textContent = closeText;
  closeButton.onclick = () => {
    overlay.remove();
    if (onclose) onclose();
  };

  content.appendChild(closeButton);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  return {
    close() {
      overlay.remove();
      if (onclose) onclose();
    },
  };
}

export class UI {
  constructor() {
    this.pointCountEl = document.getElementById("point-count");
    this.exportBtn = document.getElementById("export-btn");
    this.clearBtn = document.getElementById("clear-btn");
    this.importBtn = document.getElementById("import-gpx-btn");
  }

  updatePointCount(count) {
    const message =
      count === 0
        ? "Click map to start drawing a path."
        : count === 1
          ? "1 point added."
          : `${count} points in path.`;
    this.pointCountEl.textContent = message;
  }

  setExportButtonState(isEnabled) {
    this.exportBtn.disabled = !isEnabled;
  }

  setProcessingState(isProcessing) {
    this.clearBtn.disabled = this.importBtn.disabled = isProcessing;
  }

  showStatus(message, type, duration = 3000) {
    const colors = {
      success: {
        background: "linear-gradient(to right, #00b09b, #96c93d)",
      },
      error: {
        background: "linear-gradient(to right, #ff5f6d, #ffc371)",
      },
      info: {
        background: "linear-gradient(to right, #2980b9, #6dd5fa)",
      },
    };

    Toastify({
      text: message,
      duration: duration,
      gravity: "bottom",
      position: "right",
      stopOnFocus: true,
      style: colors[type] || colors.info,
    }).showToast();
  }

  showContextMenu({ ondelete, oncopy }) {
    const container = document.createElement("div");
    container.className = "context-menu";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete Point";
    deleteBtn.onclick = ondelete;

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy Coordinates";
    copyBtn.onclick = oncopy;

    container.appendChild(deleteBtn);
    container.appendChild(copyBtn);

    return container;
  }

  showProgressDialog(title, message = "") {
    const p = document.createElement("p");
    p.textContent = message;

    return showDialog({
      title,
      body: p,
      closeText: "Cancel",
    });
  }

  showWormholeDialog({ code, oncancel }) {
    const body = document.createElement("div");
    body.className = "wormhole-dialog";

    // Command template
    const firstLabel = document.createElement("p");
    firstLabel.textContent =
      "1. Tell the recipient to run this in their terminal:";

    const commandInput = document.createElement("input");
    commandInput.type = "text";
    commandInput.value = "wormhole receive -o <filename>.gpx";
    commandInput.readOnly = true;
    commandInput.onclick = () => {
      navigator.clipboard.writeText(commandInput.value);
      this.showStatus("Command template copied!", "success");
    };

    // Code to enter
    const secondLabel = document.createElement("p");
    secondLabel.textContent = "2. When prompted, they must enter this code:";

    const codeEl = document.createElement("div");
    codeEl.className = "wormhole-code";
    codeEl.textContent = code;

    // Assemble dialog
    body.append(firstLabel, commandInput, secondLabel, codeEl);

    showDialog({
      title: "Wormhole Ready!",
      body: body,
      closeText: "Done",
      onclose: oncancel,
    });
  }

  showErrorDialog({ title, message }) {
    showDialog({ title, message });
  }
}
