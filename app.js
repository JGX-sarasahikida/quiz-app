document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let questionsData = [];
    let state = {
        mode: '',           // 'all', 'random10', 'weak'
        quizSet: [],        // Array of question objects for the current session
        currentIndex: 0,
        score: 0,
        answered: false,
        lastConfig: { type: '', filter: null, pickedIds: [] } // For retry logic
    };
    
    // User data persisted in localStorage
    let userData = {
        bookmarks: new Set(),
        misses: new Set()
    };

    // --- Bootstrapping will happen at the end ---

    function loadUserData() {
        const storedBookmarks = localStorage.getItem('caa_bookmarks');
        const storedMisses = localStorage.getItem('caa_misses');
        
        if (storedBookmarks) userData.bookmarks = new Set(JSON.parse(storedBookmarks));
        if (storedMisses) userData.misses = new Set(JSON.parse(storedMisses));
    }

    function saveUserData() {
        localStorage.setItem('caa_bookmarks', JSON.stringify([...userData.bookmarks]));
        localStorage.setItem('caa_misses', JSON.stringify([...userData.misses]));
    }

    const fallbackData = `ID,タイトル,章,問題文,選択肢1,選択肢2,選択肢3,選択肢4,正解,ページ,解説
1,パリ協定の目標,第1章,パリ協定で合意された気温上昇の抑制目標は？,1.0℃,1.5℃,2.0℃,3.0℃,1.5℃,12,世界共通の長期目標として1.5℃に抑える努力を追求することが合意されました。
2,ネットゼロの定義,第1章,温室効果ガスの排出量と吸収量をプラスマイナスゼロにすることを何と呼ぶ？,カーボンマイナス,ネットゼロ,デカーボナイズ,エミッションフリー,ネットゼロ,20,排出と除去のバランスが取れた状態を指します。
3,CN目標年次,第1章,日本政府が宣言したカーボンニュートラルの目標年次は？,2030年,2040年,2050年,2060年,2050年,17,2050年までの達成を目指しています。`;

    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const parsed = [];
        
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',');
            if (row.length >= 11) {
                parsed.push({
                    id: row[0].trim(),
                    title: row[1].trim(),
                    chapter: row[2].trim(),
                    question: row[3].trim(),
                    options: [row[4].trim(), row[5].trim(), row[6].trim(), row[7].trim()],
                    correct: row[8].trim(),
                    page: row[9].trim(),
                    explanation: row[10].trim()
                });
            }
        }
        return parsed;
    }

    async function loadQuestions() {
        showScreen('screen-loading');
        try {
            const response = await fetch('プロトタイプ４.txt');
            if (response.ok) {
                const text = await response.text();
                questionsData = parseCSV(text);
            } else {
                console.warn('Network issue, using fallback data...');
                questionsData = parseCSV(fallbackData);
            }
        } catch (e) {
            console.error('Fetch error - Using fallback data:', e);
            questionsData = parseCSV(fallbackData);
        }
        
        if (questionsData.length === 0) {
            alert('データが見つかりません');
            return;
        }
        
        populateSetupScreen();
        populateChunkButtons();
        showScreen('screen-home');
    }

    // --- Routing Framework ---
    window.showScreen = function(screenId) {
        const screens = document.querySelectorAll('.screen');
        screens.forEach(s => s.style.display = 'none');
        document.getElementById(screenId).style.display = 'flex';
    };

    window.confirmAbandonQuiz = function() {
        if(confirm('クイズを中断してホームに戻りますか？')) {
            showScreen('screen-home');
        }
    };

    window.showSetupAllScreen = function() {
        showScreen('screen-setup-all');
    };

    // --- Mode Start Logic ---
    window.startChunkedMode = function(start, end) {
        const pool = questionsData.slice(start, end);
        state.lastConfig = { type: 'chunk', filter: { start, end }, pickedIds: pool.map(q => q.id) };
        state.mode = `全問網羅（${start + 1}〜${end}）`;
        state.quizSet = pool;
        startQuizSession();
    };

    window.startRandom10Mode = function(chapterFilter, avoidIds = []) {
        let pool = [];
        let availableQuestions = [...questionsData];
        let preferredQuestions = availableQuestions.filter(q => !avoidIds.includes(q.id));
        
        if (chapterFilter === 'mixed') {
            const chapters = [...new Set(availableQuestions.map(q => q.chapter))];
            let selected = [];
            
            chapters.forEach(ch => {
                let chPref = preferredQuestions.filter(q => q.chapter === ch);
                let chAll = availableQuestions.filter(q => q.chapter === ch);
                
                shuffleArray(chPref);
                shuffleArray(chAll);
                
                let picked = chPref.slice(0, 3);
                
                if (picked.length < 3) {
                    const needed = 3 - picked.length;
                    const filling = chAll.filter(q => !picked.includes(q)).slice(0, needed);
                    picked = picked.concat(filling);
                }
                
                selected = selected.concat(picked);
                preferredQuestions = preferredQuestions.filter(q => !picked.includes(q));
                availableQuestions = availableQuestions.filter(q => !picked.includes(q));
            });
            
            shuffleArray(preferredQuestions);
            shuffleArray(availableQuestions);
            
            const needed = 10 - selected.length;
            if (needed > 0) {
                let picked = preferredQuestions.slice(0, needed);
                if (picked.length < needed) {
                    const extraNeeded = needed - picked.length;
                    const filling = availableQuestions.filter(q => !picked.includes(q)).slice(0, extraNeeded);
                    picked = picked.concat(filling);
                }
                selected = selected.concat(picked);
            }
            pool = selected;
        } else {
            let chPref = preferredQuestions.filter(q => q.chapter === chapterFilter);
            let chAll = availableQuestions.filter(q => q.chapter === chapterFilter);
            
            shuffleArray(chPref);
            shuffleArray(chAll);
            
            pool = chPref.slice(0, 10);
            if (pool.length < 10) {
                const needed = 10 - pool.length;
                const filling = chAll.filter(q => !pool.includes(q)).slice(0, needed);
                pool = pool.concat(filling);
            }
        }

        shuffleArray(pool);
        state.lastConfig = { type: 'random10', filter: chapterFilter, pickedIds: pool.map(q => q.id) };
        state.mode = 'ランダム10問';
        state.quizSet = pool;
        startQuizSession();
    };

    window.startWeakMode = function(avoidIds = []) {
        let weakPool = questionsData.filter(q => 
            userData.bookmarks.has(q.id) || userData.misses.has(q.id)
        );

        if (weakPool.length === 0) {
            alert('現在記録されている苦手・ミス問題（または付箋）はありません！\nまずは他のテストを解いてみましょう！');
            return;
        }

        let preferred = weakPool.filter(q => !avoidIds.includes(q.id));
        shuffleArray(preferred);
        shuffleArray(weakPool);

        let pool = preferred.slice(0, 10);
        if (pool.length < 10) {
             const needed = 10 - pool.length;
             const filling = weakPool.filter(q => !pool.includes(q)).slice(0, needed);
             pool = pool.concat(filling);
        }

        shuffleArray(pool);
        state.lastConfig = { type: 'weak', filter: null, pickedIds: pool.map(q => q.id) };
        state.quizSet = pool;
        state.mode = '苦手克服';
        startQuizSession();
    };

    window.retryQuiz = function() {
        const config = state.lastConfig;
        if(config.type === 'chunk') {
            // chunk is static index
            startChunkedMode(config.filter.start, config.filter.end);
        } else if (config.type === 'random10') {
            startRandom10Mode(config.filter, config.pickedIds);
        } else if (config.type === 'weak') {
            startWeakMode(config.pickedIds);
        } else {
            showScreen('screen-home');
        }
    };

    function startQuizSession() {
        if(state.quizSet.length === 0) return;
        state.currentIndex = 0;
        state.score = 0;
        document.getElementById('quiz-header-title').textContent = state.mode;
        showScreen('screen-quiz');
        renderQuestion();
    }

    // --- Quiz Logic ---
    function renderQuestion() {
        state.answered = false;
        const q = state.quizSet[state.currentIndex];
        
        const progressPercent = (state.currentIndex / state.quizSet.length) * 100;
        document.getElementById('progress-bar').style.width = `${progressPercent}%`;
        
        document.getElementById('quiz-chapter').textContent = q.chapter;
        document.getElementById('quiz-question').textContent = q.question;
        
        const bookmarkBtn = document.getElementById('bookmark-btn');
        if (userData.bookmarks.has(q.id)) {
            bookmarkBtn.classList.add('active');
            bookmarkBtn.innerHTML = '🔖 付箋を外す';
        } else {
            bookmarkBtn.classList.remove('active');
            bookmarkBtn.innerHTML = '🔖 付箋をつける';
        }

        let optionsHtml = '';
        const shuffledOptions = [...q.options];
        shuffleArray(shuffledOptions);
        
        shuffledOptions.forEach(opt => {
            optionsHtml += `<button class="option-btn" onclick="handleAnswer(this, '${opt.replace(/'/g, "\\'")}')">${opt}</button>`;
        });
        document.getElementById('options-grid').innerHTML = optionsHtml;

        document.getElementById('feedback').classList.remove('show', 'success', 'error');
        document.getElementById('next-btn').classList.remove('show');
    }

    window.handleAnswer = function(btnElement, selectedValue) {
        if (state.answered) return;
        state.answered = true;

        const q = state.quizSet[state.currentIndex];
        const isCorrect = selectedValue === q.correct;
        
        const optionBtns = document.querySelectorAll('.option-btn');
        optionBtns.forEach(btn => {
            btn.disabled = true;
            if (btn.textContent === q.correct) {
                btn.classList.add('correct');
            }
        });

        const feedbackBox = document.getElementById('feedback');
        const feedbackHeadline = document.getElementById('feedback-headline');
        
        if (isCorrect) {
            state.score++;
            btnElement.classList.add('correct');
            feedbackBox.classList.add('success');
            feedbackHeadline.innerHTML = '✅ 正解！';
            
            // 過去に間違えた問題であれば、正解した今回でリストから削除する
            if (userData.misses.has(q.id)) {
                userData.misses.delete(q.id);
                saveUserData();
            }
        } else {
            btnElement.classList.add('incorrect');
            feedbackBox.classList.add('error');
            feedbackHeadline.innerHTML = '❌ 不正解...';
            userData.misses.add(q.id);
            saveUserData();
        }

        document.getElementById('feedback-explanation').textContent = q.explanation;
        document.getElementById('feedback-ref').textContent = `参照ページ：P.${q.page}`;
        feedbackBox.classList.add('show');
        
        const nextBtn = document.getElementById('next-btn');
        if (state.currentIndex === state.quizSet.length - 1) {
            nextBtn.textContent = '結果を見る';
        } else {
            nextBtn.textContent = '次の問題へ';
        }
        nextBtn.classList.add('show');
    };

    window.nextQuestion = function() {
        state.currentIndex++;
        if (state.currentIndex >= state.quizSet.length) {
            renderResult();
        } else {
            renderQuestion();
        }
    };

    window.toggleBookmark = function() {
        if (state.quizSet.length === 0) return;
        const q = state.quizSet[state.currentIndex];
        const bookmarkBtn = document.getElementById('bookmark-btn');
        
        if (userData.bookmarks.has(q.id)) {
            userData.bookmarks.delete(q.id);
            bookmarkBtn.classList.remove('active');
            bookmarkBtn.innerHTML = '🔖 付箋をつける';
        } else {
            userData.bookmarks.add(q.id);
            bookmarkBtn.classList.add('active');
            bookmarkBtn.innerHTML = '🔖 付箋を外す';
        }
        saveUserData();
    };

    // --- Result Logic ---
    function renderResult() {
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('result-score').textContent = `${state.score} / ${state.quizSet.length}`;
        
        const isPerfect = state.score === state.quizSet.length;
        document.getElementById('result-message').innerHTML = `
            全${state.quizSet.length}問中、<strong>${state.score}問</strong>正解しました！<br><br>
            ${isPerfect ? '素晴らしい！全問正解です！🎉' : '解説を確認したり、苦手モードを活用して復習しましょう！💪'}
        `;
        
        showScreen('screen-result');
    }

    // --- Review List Logic ---
    window.showReviewList = function() {
        const container = document.getElementById('review-list-container');
        container.innerHTML = '';
        
        const reviewItems = questionsData.filter(q => 
            userData.bookmarks.has(q.id) || userData.misses.has(q.id)
        );

        document.getElementById('review-stats').textContent = 
            `付箋: ${userData.bookmarks.size}件 / 過去のミス: ${userData.misses.size}件`;

        if (reviewItems.length === 0) {
            container.innerHTML = '<div class="empty-state">復習データがありません。<br>クイズを解いてみましょう！</div>';
            showScreen('screen-review');
            return;
        }

        reviewItems.forEach(q => {
            const isMiss = userData.misses.has(q.id);
            const isBookmarked = userData.bookmarks.has(q.id);
            
            let tagsHtml = '';
            if (isMiss) tagsHtml += '<span class="tag tag-miss">過去ミス</span>';
            if (isBookmarked) tagsHtml += '<span class="tag tag-bookmark">🔖 付箋</span>';

            const itemDiv = document.createElement('div');
            itemDiv.className = 'accordion-item';
            
            itemDiv.innerHTML = `
                <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                    <div class="accordion-title-container">
                        <span>${q.title}</span>
                        <div class="accordion-tags">${tagsHtml}</div>
                    </div>
                    <div class="accordion-icon">▼</div>
                </div>
                <div class="accordion-content">
                    <div class="review-qa">
                        <div class="review-q">Q. ${q.question}</div>
                        <div class="review-a">A. ${q.correct}</div>
                    </div>
                    <div class="review-exp">${q.explanation}</div>
                    <div class="review-page">参照: P.${q.page}</div>
                    ${isBookmarked ? `<button class="remove-bookmark-btn" onclick="removeBookmarkFromList('${q.id}')">🔖 付箋を外す</button>` : ''}
                </div>
            `;
            container.appendChild(itemDiv);
        });

        showScreen('screen-review');
    };

    window.removeBookmarkFromList = function(id) {
        if(confirm('付箋を削除しますか？')) {
            userData.bookmarks.delete(id);
            saveUserData();
            showReviewList(); // 画面再描画
        }
    };

    // --- Helpers ---
    function populateSetupScreen() {
        const chapters = [...new Set(questionsData.map(q => q.chapter))].sort();
        const container = document.getElementById('chapter-buttons');
        let html = '';
        chapters.forEach(ch => {
            html += `<button class="menu-btn setup-btn" onclick="startRandom10Mode('${ch}')">${ch} のみ出題</button>`;
        });
        container.innerHTML = html;
    }

    function populateChunkButtons() {
        const container = document.getElementById('chunk-buttons');
        let html = '';
        const limit = 10;
        const total = questionsData.length;
        for(let i = 0; i < total; i += limit) {
            let end = Math.min(i + limit, total);
            html += `<button class="menu-btn setup-btn primary" onclick="startChunkedMode(${i}, ${end})"><strong>${i+1}〜${end}番</strong></button>`;
        }
        container.innerHTML = html;
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // --- Bootstrapping ---
    loadUserData();
    loadQuestions();
});
