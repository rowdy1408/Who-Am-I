import { firebaseConfig } from './firebase-config.js';

// --- CẤU HÌNH VÀ BIẾN TOÀN CỤC ---
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTIUIX5hEeOC3hMAQVpcbkn-uX_dadggoguEhogFM31Rg0Hj8y9l0MUSf6NxoyLjk90fYxTbkvNNhTT/pub?output=csv';
let vocabularyList = [];
let currentGame = {};
let round1State = {};
let round2State = {};

// --- KHỞI TẠO FIREBASE ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// --- LẤY CÁC ELEMENT TỪ HTML ---
const screens = document.querySelectorAll('.screen');
const userNameSpan = document.getElementById('user-name');
const loginButton = document.getElementById('login-button');
const createNewGameBtn = document.getElementById('create-new-game-btn');
const playCreatedGamesBtn = document.getElementById('play-created-games-btn');
const logoutBtn = document.getElementById('logout-btn');

// --- HÀM QUẢN LÝ MÀN HÌNH ---
function showScreen(screenId) {
    screens.forEach(screen => {
        screen.classList.add('hidden');
        screen.classList.remove('fade-in');
    });
    const activeScreen = document.getElementById(screenId);
    activeScreen.classList.remove('hidden');
    activeScreen.classList.add('fade-in');
}

// --- XÁC THỰC NGƯỜI DÙNG ---
auth.onAuthStateChanged(user => {
    if (user) {
        userNameSpan.textContent = user.displayName.split(' ')[0];
        fetchVocabulary();
        showScreen('main-menu');
    } else {
        setTimeout(() => showScreen('login-screen'), 1000);
    }
});

loginButton.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => console.error("Lỗi đăng nhập:", error));
});

logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
        auth.signOut();
    }
});

// --- HÀM XỬ LÝ CSV & DỮ LIỆU ---
function parseCsvRow(row) {
    const result = []; let current = ''; let inQuotes = false;
    for (const char of row) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; } 
        else current += char;
    }
    result.push(current);
    return result.map(val => val.trim().replace(/^"|"$/g, ''));
}

async function fetchVocabulary() {
    if (!GOOGLE_SHEET_CSV_URL || GOOGLE_SHEET_CSV_URL === 'YOUR_PUBLISHED_GOOGLE_SHEET_CSV_URL') {
        alert("Vui lòng cập nhật đường link Google Sheet trong file script.js!");
        return;
    }
    try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        const csvText = await response.text();
        const rows = csvText.trim().split(/\r?\n/).slice(1).filter(row => row.trim() !== '');
        vocabularyList = rows.map((row, index) => {
            const columns = parseCsvRow(row);
            if (!columns[0] || columns[0].trim() === '') return null;
            return { id: index, word: columns[0], imageUrl: columns[1], description: columns[2] };
        }).filter(Boolean);
    } catch (error) { console.error("Lỗi tải dữ liệu:", error); alert("Không thể tải danh sách từ vựng."); }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- LOGIC TẠO GAME ---
createNewGameBtn.addEventListener('click', () => {
    if (vocabularyList.length === 0) return alert("Dữ liệu vụ án đang được tải, vui lòng thử lại sau.");
    const screen = document.getElementById('create-game-screen');
    screen.querySelector('#game-name-input').value = '';
    screen.querySelector('#search-vocab-input').value = ''; // Xóa nội dung tìm kiếm cũ
    const container = screen.querySelector('#vocabulary-list-container');
    container.innerHTML = vocabularyList.map(vocab => `<div class="vocab-item"><input type="checkbox" id="vocab-${vocab.id}" value="${vocab.id}"><label for="vocab-${vocab.id}">${vocab.word}</label></div>`).join('');
    screen.querySelector('#submit-create-game-btn').onclick = handleSubmitCreateGame;
    screen.querySelector('#back-to-main-menu-btn').onclick = () => showScreen('main-menu');
    screen.querySelector('#search-vocab-input').onkeyup = filterVocabularyList;
    showScreen('create-game-screen');
});

function handleSubmitCreateGame() {
    const name = document.getElementById('game-name-input').value.trim();
    const selected = document.querySelectorAll('#vocabulary-list-container input:checked');
    if (!name) return alert("Vui lòng đặt tên cho hồ sơ vụ án!");
    if (selected.length < 2) return alert("Phải chọn ít nhất 2 manh mối!");
    const selectedWords = Array.from(selected).map(cb => vocabularyList.find(v => v.id === parseInt(cb.value)));
    currentGame = { name, words: selectedWords };
    const confirmScreen = document.getElementById('confirmation-screen');
    confirmScreen.querySelector('#confirm-game-name').textContent = `CASE FILE: ${currentGame.name}`;
    confirmScreen.querySelector('#confirm-vocabulary-list').innerHTML = currentGame.words.map(w => `<p>• ${w.word}</p>`).join('');
    confirmScreen.querySelector('#confirm-yes-btn').onclick = () => { saveGameToLocalStorage(currentGame); startRound1(currentGame); };
    confirmScreen.querySelector('#confirm-no-btn').onclick = () => showScreen('create-game-screen');
    showScreen('confirmation-screen');
}

// --- LOCAL STORAGE & QUẢN LÝ GAME ĐÃ LƯU ---
function saveGameToLocalStorage(newGame) {
    const games = loadGamesFromLocalStorage();
    newGame.id = Date.now();
    games.push(newGame);
    localStorage.setItem('myGames', JSON.stringify(games));
}
function loadGamesFromLocalStorage() { return JSON.parse(localStorage.getItem('myGames') || '[]'); }
function deleteGame(gameId) {
    let games = loadGamesFromLocalStorage();
    games = games.filter(g => g.id !== gameId);
    localStorage.setItem('myGames', JSON.stringify(games));
}

playCreatedGamesBtn.addEventListener('click', () => { displaySavedGames(); showScreen('saved-games-screen'); });

function displaySavedGames() {
    const games = loadGamesFromLocalStorage();
    const container = document.getElementById('saved-games-list');
    container.innerHTML = '';
    if (games.length === 0) {
        container.innerHTML = '<p>No case files found.</p>';
    } else {
        games.reverse().forEach(game => {
            const wordsPreview = game.words.map(w => w.word).slice(0, 5).join(', ');
            const andMore = game.words.length > 5 ? '...' : '';
            container.innerHTML += `<div class="saved-game-item"><div class="saved-game-info"><h4>${game.name}</h4><p>Clues: ${wordsPreview}${andMore}</p></div><div class="saved-game-actions"><button class="play-again-btn" data-id="${game.id}">OPEN</button><button class="delete-btn" data-id="${game.id}">DELETE</button></div></div>`;
        });
    }
    container.querySelectorAll('.play-again-btn').forEach(btn => btn.onclick = (e) => {
        const gameToPlay = loadGamesFromLocalStorage().find(g => g.id === Number(e.target.dataset.id));
        if (gameToPlay) startRound1(gameToPlay);
    });
    container.querySelectorAll('.delete-btn').forEach(btn => btn.onclick = (e) => {
        if (confirm('Are you sure you want to delete this case file?')) {
            deleteGame(Number(e.target.dataset.id));
            displaySavedGames();
        }
    });
    document.getElementById('back-to-menu-from-list-btn').onclick = () => showScreen('main-menu');
}

// --- VÒNG 1: IMAGE -> WORD ---
function startRound1(gameData) {
    currentGame = gameData;
    const screen = document.getElementById('round-1-screen');
    screen.innerHTML = `<h2>STAGE 1: VISUAL EVIDENCE</h2><p id="round-1-progress"></p><div id="round-1-image-container"><img id="round-1-image" src="" alt="Evidence"></div><div id="round-1-feedback" class="feedback"></div><div id="round-1-answers-container"></div>`;
    const minChoices = gameData.words.length + 1, maxChoices = Math.min(gameData.words.length + 4, vocabularyList.length);
    const randomChoices = Math.floor(Math.random() * (maxChoices - minChoices + 1)) + minChoices;
    round1State = { questions: shuffleArray([...gameData.words]), currentQuestionIndex: 0, errorCount: {}, numberOfChoices: randomChoices };
    gameData.words.forEach(word => { round1State.errorCount[word.word] = 0; });
    showScreen('round-1-screen');
    displayNextRound1Question();
}

function displayNextRound1Question() {
    if (round1State.currentQuestionIndex >= round1State.questions.length) { endRound1(); return; }
    const q = round1State.questions[round1State.currentQuestionIndex];
    document.getElementById('round-1-progress').textContent = `Evidence ${round1State.currentQuestionIndex + 1} of ${round1State.questions.length}`;
    document.getElementById('round-1-image').src = q.imageUrl;
    document.getElementById('round-1-feedback').innerHTML = '';
    let choices = shuffleArray([q, ...shuffleArray(vocabularyList.filter(v => v.word !== q.word)).slice(0, round1State.numberOfChoices - 1)]);
    const container = document.getElementById('round-1-answers-container');
    container.innerHTML = choices.map(c => `<button data-word="${c.word}">${c.word}</button>`).join('');
    container.querySelectorAll('button').forEach(btn => btn.addEventListener('click', handleRound1Answer));
}

function handleRound1Answer(event) {
    const selected = event.target.dataset.word;
    const correct = round1State.questions[round1State.currentQuestionIndex].word;
    const feedback = document.getElementById('round-1-feedback');
    if (selected === correct) {
        feedback.textContent = '✅ Correct!';
        feedback.style.color = 'green';
        document.getElementById('audio-correct').play();
        document.querySelectorAll('#round-1-answers-container button').forEach(btn => btn.disabled = true);
        setTimeout(() => {
            round1State.currentQuestionIndex++;
            displayNextRound1Question();
        }, 1200);
    } else {
        feedback.textContent = '❌ Oh no, try again!';
        feedback.style.color = 'red';
        document.getElementById('audio-wrong').play();
        event.target.disabled = true;
        round1State.errorCount[correct]++;
    }
}

function endRound1() {
    const introScreen = document.getElementById('round-2-intro-screen');
    introScreen.querySelector('#start-round-2-btn').onclick = () => startRound2(currentGame);
    showScreen('round-2-intro-screen');
}

// --- VÒNG 2: DESCRIPTION -> IMAGE ---
function startRound2(gameData) {
    const screen = document.getElementById('round-2-screen');
    screen.innerHTML = `<h2>STAGE 2: FIELD REPORTS</h2><p id="round-2-progress"></p><p id="round-2-description"></p><div id="round-2-feedback" class="feedback"></div><div id="round-2-image-choices"></div><button id="next-round-2-btn" class="hidden">NEXT REPORT</button>`;
    round2State = { questions: shuffleArray([...gameData.words]), currentQuestionIndex: 0, errorCount: {} };
    gameData.words.forEach(word => { round2State.errorCount[word.word] = 0; });
    showScreen('round-2-screen');
    displayNextRound2Question();
}

function displayNextRound2Question() {
    if (round2State.currentQuestionIndex >= round2State.questions.length) { showFinalSummary(); return; }
    const q = round2State.questions[round2State.currentQuestionIndex];
    document.getElementById('round-2-progress').textContent = `Report ${round2State.currentQuestionIndex + 1} of ${round2State.questions.length}`;
    document.getElementById('round-2-description').textContent = q.description;
    document.getElementById('round-2-feedback').innerHTML = '';
    const choicesContainer = document.getElementById('round-2-image-choices');
    choicesContainer.innerHTML = shuffleArray([...currentGame.words]).map(word => `<img src="${word.imageUrl}" alt="${word.word}" data-word="${word.word}" class="round-2-choice-image">`).join('');
    choicesContainer.querySelectorAll('img').forEach(img => img.addEventListener('click', handleRound2Answer));
    document.getElementById('next-round-2-btn').classList.add('hidden');
}

function handleRound2Answer(event) {
    const selected = event.target.dataset.word;
    const correct = round2State.questions[round2State.currentQuestionIndex].word;
    const feedbackEl = document.getElementById('round-2-feedback');
    if (selected === correct) {
        feedbackEl.textContent = '✅ Correct!';
        feedbackEl.style.color = 'green';
        document.getElementById('audio-correct').play();
        document.querySelectorAll('.round-2-choice-image').forEach(img => {
            img.style.pointerEvents = 'none';
            if (img.dataset.word === correct) img.classList.add('correct');
        });
        const nextBtn = document.getElementById('next-round-2-btn');
        nextBtn.classList.remove('hidden');
        nextBtn.onclick = () => {
            round2State.currentQuestionIndex++;
            displayNextRound2Question();
        };
    } else {
        feedbackEl.textContent = '❌ Oh no, try again!';
        feedbackEl.style.color = 'red';
        document.getElementById('audio-wrong').play();
        event.target.classList.add('incorrect');
        event.target.style.pointerEvents = 'none';
        round2State.errorCount[correct]++;
    }
}

// --- BẢNG TỔNG KẾT ---
function showFinalSummary() {
    const screen = document.getElementById('final-summary-screen');
    const incorrectWords = currentGame.words.filter(word => round1State.errorCount[word.word] > 0 || round2State.errorCount[word.word] > 0);
    let tableRows = currentGame.words.map(word => `<tr><td>${word.word}</td><td>${round1State.errorCount[word.word]}</td><td>${round2State.errorCount[word.word]}</td></tr>`).join('');
    
    let reviewButtonHTML = '';
    if (incorrectWords.length > 0) {
        reviewButtonHTML = `<button id="review-incorrect-btn">Ôn tập ${incorrectWords.length} từ sai</button>`;
    } else {
        reviewButtonHTML = `<p style="color: green; font-weight: bold;">🎉 Chúc mừng! Bạn đã trả lời đúng tất cả!</p>`;
    }

    screen.innerHTML = `
        <h2>CASE CLOSED</h2>
        <p>Debriefing for Case File: "${currentGame.name}"</p>
        <table id="summary-table">
            <thead><tr><th>Clue</th><th>Mistakes (Stage 1)</th><th>Mistakes (Stage 2)</th></tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
        <div class="menu-actions">
            ${reviewButtonHTML}
            <button id="back-to-menu-btn">VỀ MÀN HÌNH CHÍNH</button>
        </div>`;

    const reviewBtn = screen.querySelector('#review-incorrect-btn');
    if (reviewBtn) {
        reviewBtn.onclick = () => {
            const reviewGame = { ...currentGame, name: `${currentGame.name} - Ôn tập`, words: incorrectWords };
            startRound1(reviewGame);
        };
    }
    screen.querySelector('#back-to-menu-btn').onclick = () => showScreen('main-menu');
    showScreen('final-summary-screen');
}

// Bắt đầu ứng dụng
showScreen('loading-screen');

// --- HÀM LỌC DANH SÁCH TỪ VỰNG TẠO GAME ---
function filterVocabularyList() {
    // 1. Lấy nội dung tìm kiếm và chuyển thành chữ thường
    const filterText = document.getElementById('search-vocab-input').value.toLowerCase();
    
    // 2. Lấy tất cả các mục từ vựng
    const items = document.querySelectorAll('#vocabulary-list-container .vocab-item');

    // 3. Lặp qua từng mục
    items.forEach(item => {
        // Lấy nội dung chữ của nhãn (label)
        const label = item.querySelector('label');
        const itemText = label.textContent.toLowerCase();
        
        // 4. So sánh và ẩn/hiện
        if (itemText.includes(filterText)) {
            item.style.display = 'block'; // Hiện nếu khớp
        } else {
            item.style.display = 'none'; // Ẩn nếu không khớp
        }
    });
}
