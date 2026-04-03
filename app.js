document.addEventListener('DOMContentLoaded', () => {
    const appEl = document.getElementById('app');
    
    // 状態管理
    let state = {
        questions: [],
        currentIndex: 0,
        score: 0,
        answered: false
    };

    // 万が一ファイルアクセスエラーになった時のフォールバックデータ
    const fallbackData = `章,問題文,選択肢1,選択肢2,選択肢3,選択肢4,正解,ページ,解説
第1章,パリ協定で合意された気温上昇の抑制目標は？,1.0℃,1.5℃,2.0℃,3.0℃,1.5℃,12,世界共通の長期目標として1.5℃に抑える努力を追求することが合意されました。
第1章,TCFDの「F」は何の略？,Forest,Future,Financial,Factory,Financial,10,気候関連財務情報開示タスクフォース（Financial）です。
第1章,2020年に日本政府が宣言したカーボンニュートラルの目標年次は？,2030年,2040年,2050年,2060年,2050年,17,2050年カーボンニュートラルを目指すことが宣言されました。
第2章,SBTの中小企業版にはない要件は？,Scope1の算定,Scope2の算定,Scope3の算定,コミットメントレターの提出,Scope3の算定,41,中小企業版SBTではScope3の算定・目標設定は任意とされています。
第2章,企業の再エネ100%化を目指す国際イニシアチブは？,RE100,SBTi,TCFD,CDP,RE100,54,Renewable Energy 100%の略称です。
第3章,自社での燃料使用による直接的な排出はどのScope？,Scope 1,Scope 2,Scope 3,Scope 4,Scope 1,60,自社による直接排出がScope 1です。
第3章,他社から供給された電気や熱の使用に伴う間接排出は？,Scope 1,Scope 2,Scope 3,カテゴリ1,Scope 2,60,エネルギー起源の間接排出がScope 2です。
第4章,Scope 3のカテゴリ1の算定対象は？,自社の固定資産,原材料の採掘から製造まで,製品の廃棄,従業員の通勤,原材料の採掘から製造まで,92,購入した製品やサービスの排出量が対象です。
第5章,日本の「温対法」の正式名称に含まれる言葉は？,エネルギー使用の合理化,地球温暖化対策の推進,再エネ導入,カーボンリサイクル,地球温暖化対策の推進,155,地球温暖化対策の推進に関する法律です。`;

    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const questions = [];
        
        // ヘッダー行をスキップ (i=1から開始)
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',');
            if (row.length >= 9) {
                questions.push({
                    chapter: row[0].trim(),
                    question: row[1].trim(),
                    options: [row[2].trim(), row[3].trim(), row[4].trim(), row[5].trim()],
                    correct: row[6].trim(),
                    page: row[7].trim(),
                    explanation: row[8].trim()
                });
            }
        }
        return questions;
    }

    async function loadData() {
        appEl.innerHTML = '<div class="content loading">クイズデータを読み込んでいます...</div>';
        
        try {
            // ローカルファイルからのfetchを試みる
            const response = await fetch('プロトタイプ１.txt');
            if (response.ok) {
                const text = await response.text();
                state.questions = parseCSV(text);
            } else {
                console.warn('Network load failed, using fallback data...');
                state.questions = parseCSV(fallbackData);
            }
        } catch (e) {
            console.error('Fetch error - Using fallback data (CORS limitation via file:// protocol is normal):', e);
            state.questions = parseCSV(fallbackData);
        }
        
        if(state.questions.length === 0) {
           appEl.innerHTML = '<div class="content loading">問題データの読み込みに失敗しました。</div>';
           return; 
        }

        renderQuiz();
    }

    function renderQuiz() {
        state.answered = false;
        
        const q = state.questions[state.currentIndex];
        const progressPercent = ((state.currentIndex) / state.questions.length) * 100;

        appEl.innerHTML = `
            <div class="header">炭素会計アドバイザー3級</div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${progressPercent}%"></div>
            </div>
            <div class="content" id="quiz-content">
                <div class="chapter-badge">${q.chapter}</div>
                <div class="question-text">${q.question}</div>
                
                <div class="options-grid" id="options-grid">
                    ${q.options.map((opt, index) => `
                        <button class="option-btn" data-value="${opt}">${opt}</button>
                    `).join('')}
                </div>
                
                <div id="feedback" class="feedback-box">
                    <div class="feedback-headline" id="feedback-headline"></div>
                    <div class="feedback-explanation">${q.explanation}</div>
                    <div class="feedback-reference">参照ページ：P.${q.page}</div>
                </div>

                <button id="next-btn" class="next-btn">次の問題へ</button>
            </div>
        `;

        // イベントリスナーの追加
        const optionBtns = document.querySelectorAll('.option-btn');
        optionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => handleAnswer(e.target));
        });

        document.getElementById('next-btn').addEventListener('click', () => {
            state.currentIndex++;
            if (state.currentIndex >= state.questions.length) {
                renderResult();
            } else {
                renderQuiz();
            }
        });
    }

    function handleAnswer(selectedBtn) {
        if (state.answered) return; // 複数回クリックを防ぐ
        state.answered = true;

        const q = state.questions[state.currentIndex];
        const selectedValue = selectedBtn.getAttribute('data-value');
        const isCorrect = selectedValue === q.correct;
        
        // 全ボタンを無効化
        const optionBtns = document.querySelectorAll('.option-btn');
        optionBtns.forEach(btn => {
            btn.disabled = true;
            // 正解のボタンは必ずハイライト
            if (btn.getAttribute('data-value') === q.correct) {
                btn.classList.add('correct');
            }
        });

        const feedbackBox = document.getElementById('feedback');
        const feedbackHeadline = document.getElementById('feedback-headline');
        const nextBtn = document.getElementById('next-btn');

        if (isCorrect) {
            state.score++;
            selectedBtn.classList.add('correct');
            feedbackBox.classList.add('success');
            feedbackHeadline.innerHTML = '✅ 正解！';
        } else {
            selectedBtn.classList.add('incorrect');
            feedbackBox.classList.add('error');
            feedbackHeadline.innerHTML = '❌ 不正解...';
        }

        feedbackBox.classList.add('show');
        
        // 最後の問題の場合はボタンのテキストを変更
        if(state.currentIndex === state.questions.length - 1) {
            nextBtn.textContent = '結果を見る';
        }
        
        // 次へボタンを表示
        nextBtn.classList.add('show');
    }

    function renderResult() {
        const progressPercent = 100;
        
        // 全問正解時のメッセージを変える
        const isPerfect = state.score === state.questions.length;

        appEl.innerHTML = `
            <div class="header">炭素会計アドバイザー3級</div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${progressPercent}%"></div>
            </div>
            <div class="content result-screen">
                <div class="score-circle">
                    ${state.score} / ${state.questions.length}
                </div>
                <div class="result-message">
                    全${state.questions.length}問中、<strong>${state.score}問</strong>正解しました！<br><br>
                    ${isPerfect ? '素晴らしい！全問正解です！🎉' : 'お疲れ様でした。復習して満点を目指しましょう！💪'}
                </div>
                <button class="restart-btn" id="restart-btn">もう一度挑戦する</button>
            </div>
        `;

        document.getElementById('restart-btn').addEventListener('click', () => {
            state.currentIndex = 0;
            state.score = 0;
            renderQuiz();
        });
    }

    // アプリ起動
    loadData();
});
