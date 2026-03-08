
const hostname = window.location.hostname;
const protocol = window.location.protocol;
const port = 3000;

export const API_URL = `${protocol}//${hostname}:${port}`;
export const WS_URL = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}:${port}`;
