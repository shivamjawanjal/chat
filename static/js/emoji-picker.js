/**
 * emoji-picker.js — Lightweight emoji picker
 * No external dependencies required.
 */
const EmojiPicker = (() => {
  const EMOJIS = [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊',
    '😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗',
    '🤩','🤔','🫤','😐','😑','😶','🙄','😏','😒','😞',
    '😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺',
    '😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶',
    '😱','😨','😰','😥','😓','🤭','🤫','🤥','😶‍🌫️','😬',
    '😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵',
    '🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠',
    '👍','👎','👏','🙌','🤝','🤜','🤛','👊','✊','👋',
    '🤙','💪','🦾','🖐️','✋','🖖','☝️','👆','👇','👉',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞',
    '💓','💗','💖','💘','💝','💟','☮️','✌️','🤞','🤟',
    '🎉','🎊','🎈','🎁','🎀','🎂','🎆','🎇','✨','🌟',
    '⭐','🌈','☀️','🌙','⚡','🔥','💧','🌊','🌸','🌺',
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
    '🍕','🍔','🌮','🍣','🍜','🍦','🍩','🍪','🎂','🧁',
  ];

  function build(container, onSelect) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    EMOJIS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'emoji-item';
      btn.textContent = emoji;
      btn.title = emoji;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onSelect(emoji);
      });
      grid.appendChild(btn);
    });
    container.appendChild(grid);
  }

  return { build };
})();
