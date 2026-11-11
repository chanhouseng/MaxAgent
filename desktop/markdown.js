'use strict';

// Marked identifies Markdown tokens. Only this code chooses which DOM elements exist.
function renderAgentMarkdown(target, source) {
 const document = target.ownerDocument;
 const text = typeof source === 'string' ? source : '';
 const add = (parent, tag) => parent.appendChild(document.createElement(tag));
 const write = (parent, tokens, depth = 0) => {
  for (const token of tokens) {
   if (depth >= 50) { parent.append(token.raw ?? token.text ?? ''); continue; }
   const children = (node, part = token) => part.tokens ? write(node, part.tokens, depth + 1) : node.append(part.text ?? '');
   switch (token.type) {
    case 'space': case 'def': break;
    case 'paragraph': children(add(parent, 'p')); break;
    case 'heading': children(add(parent, 'h' + Math.min(6, Math.max(1, token.depth)))); break;
    case 'blockquote': children(add(parent, 'blockquote')); break;
    case 'strong': case 'em': case 'del': children(add(parent, token.type)); break;
    case 'br': case 'hr': add(parent, token.type); break;
    case 'code': add(add(parent, 'pre'), 'code').textContent = token.text; break;
    case 'codespan': add(parent, 'code').textContent = token.text; break;
    case 'list': {
     const list = add(parent, token.ordered ? 'ol' : 'ul');
     if (token.ordered && Number.isSafeInteger(token.start)) list.start = token.start;
     for (const item of token.items) children(add(list, 'li'), item);
     break;
    }
    case 'checkbox': {
     const input = add(parent, 'input'); input.type = 'checkbox'; input.checked = token.checked; input.disabled = true;
     parent.append(' ');
     break;
    }
    case 'table': {
     const wrapper = add(parent, 'div'); wrapper.className = 'markdown-table';
     const table = add(wrapper, 'table');
     const row = (section, cells, tag) => {
      const tr = add(section, 'tr');
      for (const cell of cells) {
       const node = add(tr, tag);
       if (tag === 'th') node.scope = 'col';
       if (['left', 'center', 'right'].includes(cell.align)) node.className = 'markdown-align-' + cell.align;
       children(node, cell);
      }
     };
     row(add(table, 'thead'), token.header, 'th');
     const body = add(table, 'tbody');
     for (const cells of token.rows) row(body, cells, 'td');
     break;
    }
    case 'link': {
     children(parent);
     if (token.href && token.href !== token.text) {
      const address = add(parent, 'span'); address.className = 'markdown-link-target'; address.textContent = ' (' + token.href + ')';
     }
     break;
    }
    case 'image': parent.append(token.text ? '[圖片：' + token.text + ']' : '[圖片]'); break;
    case 'text': case 'escape': children(parent); break;
    case 'html': {
     if (token.block) { const node = add(parent, 'p'); node.className = 'markdown-raw'; node.textContent = token.text; }
     else parent.append(token.text);
     break;
    }
    default: parent.append(token.raw ?? token.text ?? '');
   }
  }
 };
 try {
  const fragment = document.createDocumentFragment();
  write(fragment, window.marked.lexer(text));
  target.classList.add('markdown-body');
  target.replaceChildren(fragment);
 } catch {
  target.classList.remove('markdown-body');
  target.textContent = text;
 }
}
