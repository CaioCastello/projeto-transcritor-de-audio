const WEBHOOK_URL = 'http://187.127.0.97:5678/webhook/transcricaoaudio';
const MAX_FILE_SIZE = 20 * 1024 * 1024;

let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let audioFileName = 'gravacao.webm';
let recordingMimeType = 'audio/webm';
let timerInterval = null;
let elapsed = 0;
let state = 'idle';

// ---- Login Modal ----
function openLoginModal() {
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('loginModal').classList.add('open');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('open');
}

function doLogin() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (user === 'admin' && pass === '123') {
    window.location.href = 'https://castellocaio.cfd/portfolio/projetos/transcricao/analise.php';
  } else {
    const err = document.getElementById('loginError');
    err.textContent = 'Usuário ou senha incorretos.';
    err.classList.remove('hidden');
  }
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && document.getElementById('loginModal').classList.contains('open')) {
    doLogin();
  }
});

// ---- Masks ----
document.getElementById('cpf').addEventListener('input', function () {
  let v = this.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  this.value = v;
});

document.getElementById('telefone').addEventListener('input', function () {
  let v = this.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 6) v = v.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,5})/, '($1) $2');
  else if (v.length > 0) v = v.replace(/(\d{1,2})/, '($1');
  this.value = v;
});

// ---- Helpers ----
function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('errorMsg').classList.add('hidden');
}

function updateUI() {
  const isActive = state === 'recording' || state === 'paused';
  document.getElementById('recordingArea').classList.toggle('hidden', !isActive);
  document.getElementById('btnRecord').classList.toggle('hidden', isActive);
  document.getElementById('btnUpload').classList.toggle('hidden', isActive);
  document.getElementById('btnPause').classList.toggle('hidden', state !== 'recording');
  document.getElementById('btnResume').classList.toggle('hidden', state !== 'paused');
  document.getElementById('recDot').style.animationPlayState = state === 'paused' ? 'paused' : 'running';
  document.getElementById('btnProcess').classList.toggle('hidden', !audioBlob || isActive);
}

function startTimer() {
  timerInterval = setInterval(() => {
    elapsed++;
    document.getElementById('timer').textContent = formatTime(elapsed);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

// ---- MIME type detection (iOS compatible) ----
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
    ''
  ];
  for (const t of types) {
    if (t === '') return { mimeType: '', ext: 'wav' };
    try {
      if (MediaRecorder.isTypeSupported(t)) {
        const ext = t.includes('mp4') || t.includes('aac') ? 'm4a' : t.includes('ogg') ? 'ogg' : 'webm';
        return { mimeType: t, ext };
      }
    } catch (e) { /* ignore */ }
  }
  return { mimeType: '', ext: 'wav' };
}

// ---- Recording ----
async function startRecording() {
  hideError();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    audioBlob = null;
    elapsed = 0;
    document.getElementById('timer').textContent = '00:00';
    document.getElementById('playerWrap').classList.add('hidden');

    const { mimeType, ext } = getSupportedMimeType();
    recordingMimeType = mimeType;
    audioFileName = 'gravacao.' + ext;

    const options = mimeType ? { mimeType } : {};
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blobType = recordingMimeType || 'audio/wav';
      audioBlob = new Blob(audioChunks, { type: blobType });
      const url = URL.createObjectURL(audioBlob);
      document.getElementById('audioPlayer').src = url;
      document.getElementById('playerWrap').classList.remove('hidden');
      state = 'finished';
      updateUI();
    };

    mediaRecorder.start(1000);
    state = 'recording';
    startTimer();
    updateUI();
  } catch (err) {
    showError('Não foi possível acessar o microfone. Verifique as permissões.');
  }
}

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    state = 'paused';
    stopTimer();
    updateUI();
  }
}

function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    state = 'recording';
    startTimer();
    updateUI();
  }
}

function requestStop() {
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

function confirmStop() {
  closeModal();
  stopTimer();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

// ---- Upload ----
function handleUpload(e) {
  hideError();
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) { showError('Arquivo muito grande. Máximo: 20MB.'); return; }

  audioBlob = file;
  audioFileName = file.name;
  const url = URL.createObjectURL(file);
  document.getElementById('audioPlayer').src = url;
  document.getElementById('playerWrap').classList.remove('hidden');
  state = 'finished';
  updateUI();
  e.target.value = '';
}

// ---- Process / Send ----
async function processAudio() {
  hideError();
  const fb = document.getElementById('feedback');
  fb.classList.add('hidden');

  const nome = document.getElementById('nome').value.trim();
  const cpf = document.getElementById('cpf').value;
  const telefone = document.getElementById('telefone').value;

  if (!nome) { showError('Preencha o nome.'); return; }
  if (cpf.replace(/\D/g, '').length !== 11) { showError('CPF inválido.'); return; }
  if (telefone.replace(/\D/g, '').length < 10) { showError('Telefone inválido.'); return; }
  if (!audioBlob) { showError('Grave ou faça upload de um áudio.'); return; }

  const btn = document.getElementById('btnProcess');
  const label = document.getElementById('processLabel');
  const sendIcon = document.getElementById('sendIcon');
  const loadingIcon = document.getElementById('loadingIcon');

  btn.disabled = true;
  label.textContent = 'Enviando...';
  sendIcon.classList.add('hidden');
  loadingIcon.classList.remove('hidden');

  try {
    const fd = new FormData();
    fd.append('nome', nome);
    fd.append('cpf', cpf.replace(/\D/g, ''));
    fd.append('telefone', telefone.replace(/\D/g, ''));
    fd.append('duracao', elapsed);
    fd.append('audio', audioBlob, audioFileName);

    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    fb.textContent = 'Áudio enviado com sucesso!';
    fb.className = 'feedback success';
    fb.classList.remove('hidden');
  } catch (err) {
    fb.textContent = 'Erro ao enviar: ' + err.message;
    fb.className = 'feedback error';
    fb.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    label.textContent = 'Processar Áudio';
    sendIcon.classList.remove('hidden');
    loadingIcon.classList.add('hidden');
  }
}
