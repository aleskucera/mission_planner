export async function createWormhole(gpx) {
  const response = await fetch("/api/create_wormhole", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gpx }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create wormhole: ${response.status}`);
  }

  return response.json();
}

export async function cancelWormhole(transfer_id) {
  const response = await fetch("/api/cancel_wormhole", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transfer_id }),
  });

  if (!response.ok) {
    throw new Error(`Failed to cancel wormhole: ${response.status}`);
  }

  return response.json();
}
