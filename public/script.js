document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const conversationList = document.getElementById('conversation-list');
  const newConvoButton = document.getElementById('new-convo');
  const modeSelect = document.getElementById('mode-select');

  let mode = modeSelect.value;
  let conversationId = getOrCreateConvoId();
  let typingBubble = null;

  function getStorageKey() {
    return `allConversations`;
  }

  function getOrCreateConvoId() {
    const saved = localStorage.getItem('currentConvo');
    return saved || createNewConvo();
  }

  function createNewConvo() {
    const newId = Date.now().toString() + '-' + mode;
    localStorage.setItem('currentConvo', newId);
    saveConversationId(newId);
    localStorage.setItem(`title_${newId}`, 'Nouvelle conversation');
    updateConversationList(newId);
    return newId;
  }

  function saveConversationId(id) {
    const key = getStorageKey();
    let all = JSON.parse(localStorage.getItem(key) || '[]');
    if (!all.includes(id)) {
      all.push(id);
      localStorage.setItem(key, JSON.stringify(all));
    }
  }

  function addMessage(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTypingIndicator() {
    typingBubble = document.createElement('div');
    typingBubble.className = 'message bot typing-indicator';
    typingBubble.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(typingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeTypingIndicator() {
    if (typingBubble) {
      typingBubble.remove();
      typingBubble = null;
    }
  }

  function formatAmazonResponse(text) {
    let cleaned = text
      .replace(/recherche amazon\s*:.*/i, '')
      .replace(/\!\[.*?\]\(.*?\)/g, '')
      .replace(/\n+/g, '<br>')
      .trim();

    const amazonRegex = /(https:\/\/www\.amazon\.ca\/[^\s)]+)/;
    const match = text.match(amazonRegex);
    if (match) {
      let rawLink = match[1].replace('/gp/product/', '/dp/');
      cleaned += `<br><br><a href="${rawLink}" target="_blank" rel="noopener noreferrer">${rawLink}</a>`;
    }

    return cleaned;
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    addMessage('user', message);
    chatInput.value = '';
    showTypingIndicator();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId, mode }),
      });

      const data = await response.json();
      removeTypingIndicator();
      const formatted = formatAmazonResponse(data.reply);
      addMessage('bot', formatted);

      if (!localStorage.getItem(`title_${conversationId}`) || localStorage.getItem(`title_${conversationId}`) === 'Nouvelle conversation') {
        localStorage.setItem(`title_${conversationId}`, message.slice(0, 30));
      }

      updateConversationList(conversationId, message);
    } catch {
      removeTypingIndicator();
      addMessage('bot', '❌ Erreur lors de la communication avec l’IA.');
    }
  });

  newConvoButton.addEventListener('click', () => {
    conversationId = createNewConvo();
    chatMessages.innerHTML = '';
    displayWelcome();
  });

  modeSelect.addEventListener('change', () => {
    mode = modeSelect.value;
    const all = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
    let current = all.find(id => id.endsWith('-' + mode));
    if (!current) {
      current = createNewConvo();
    } else {
      localStorage.setItem('currentConvo', current);
    }
    conversationId = current;
    chatMessages.innerHTML = '';
    loadConversation(conversationId);
    updateConversationList(conversationId);
  });

  function loadConversation(id) {
    fetch(`/api/chat/history/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.history.length === 0) {
          displayWelcome();
        } else {
          data.history.forEach(entry =>
            addMessage(entry.role === 'user' ? 'user' : 'bot', formatAmazonResponse(entry.content))
          );
        }
      });
  }

  function displayWelcome() {
    const welcomeText = mode === 'pieces'
      ? `🔧 <strong>MecanIA</strong> vous aide à trouver rapidement la bonne pièce pour votre moteur thermique.<br>Indiquez la machine, le modèle et ce que vous cherchez — je m’occupe du reste 🛠️`
      : `📘 <strong>MecanIA</strong> répond à vos questions techniques sur l’entretien, l’installation ou le dépannage de vos machines thermiques 🧠 Posez votre question pour commencer.`;
    addMessage('bot', welcomeText);
  }

  function updateConversationList(currentId, lastMessage = '') {
    const key = getStorageKey();
    let all = JSON.parse(localStorage.getItem(key) || '[]');
    conversationList.innerHTML = '';

    all.filter(id => id.endsWith('-' + mode)).forEach(id => {
      const isActive = id === currentId;
      const title = localStorage.getItem(`title_${id}`) || (mode === 'aide' ? '📘 Aide' : '🔧 Pièce');
      const span = document.createElement('span');
      span.textContent = title;
      span.style.flex = '1';
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => {
        conversationId = id;
        localStorage.setItem('currentConvo', id);
        chatMessages.innerHTML = '';
        loadConversation(id);
        updateConversationList(id);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = 'Supprimer';
      deleteBtn.className = 'delete-btn';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm("❗ Supprimer cette conversation ?")) {
          all = all.filter(cid => cid !== id);
          localStorage.removeItem(`title_${id}`);
          localStorage.setItem(key, JSON.stringify(all));
          if (conversationId === id) {
            conversationId = createNewConvo();
            chatMessages.innerHTML = '';
            displayWelcome();
          }
          updateConversationList(conversationId);
        }
      });

      const item = document.createElement('li');
      item.appendChild(span);
      item.appendChild(deleteBtn);
      item.className = isActive ? 'active' : '';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';

      conversationList.appendChild(item);
    });
  }

  chatMessages.innerHTML = '';
  loadConversation(conversationId);
  updateConversationList(conversationId);
});
