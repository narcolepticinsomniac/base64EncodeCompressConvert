(() => {
  'use strict';

  let dragCounter = 0;
  const originalFiles = new Map();
  const label = document.getElementById('max-dim');
  const select = document.getElementById('max-dim-select');
  const results = document.getElementById('results');
  const chooseFiles = document.getElementById('choose-files');
  const clearAll = document.getElementById('clear-all');
  const filePicker = document.getElementById('file-picker');
  const slider = document.getElementById('compression-slider');
  const sliderLabel = document.getElementById('compression-label');
  const maxDimSelect = document.getElementById('max-dim-select');

  label.addEventListener('click', e => {
    if (e.target === select) return;
    e.preventDefault();
    try {
      select.focus();
      select.showPicker();
    } catch {
      select.focus();
    }
  });

  const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('b64-encoder-db', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const dbOp = (mode, fn) => dbPromise.then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('items', mode);
    const res = fn(tx.objectStore('items'));
    tx.oncomplete = () => resolve(res?.result);
    tx.onerror = () => reject(tx.error);
  }));

  const dbSaveItem = item => dbOp('readwrite', s => s.put(item));
  const dbDeleteItem = id => dbOp('readwrite', s => s.delete(id));
  const dbClearItems = () => dbOp('readwrite', s => s.clear());
  const dbGetAllItems = () => dbOp('readonly', s => s.getAll());

  const syncSliderUI = save => {
    const val = parseInt(slider.value, 10);
    sliderLabel.textContent = val === 0 ? '0% (Original / Lossless)' : `${val}% (Lossy WebP)`;
    if (save && localStorage) {
      localStorage.setItem('slider-compression', val);
    }
  };

  if (localStorage && localStorage.getItem('slider-compression') !== null) {
    slider.value = localStorage.getItem('slider-compression');
  }
  syncSliderUI(false);

  if (localStorage && localStorage.getItem('slider-max-dim') !== null) {
    maxDimSelect.value = localStorage.getItem('slider-max-dim');
  }

  maxDimSelect.addEventListener('change', () => {
    if (localStorage) localStorage.setItem('slider-max-dim', maxDimSelect.value);
    reprocessAllItems();
  });

  slider.addEventListener('input', () => syncSliderUI(true));

  slider.addEventListener('change', () => {
    syncSliderUI(true);
    reprocessAllItems();
  });

  addEventListener('pageshow', () => syncSliderUI(false));

  addEventListener('dragenter', e => {
    e.preventDefault();
    dragCounter++;
    document.body.classList.add('dragging');
  });

  addEventListener('dragover', e => e.preventDefault());

  addEventListener('dragleave', e => {
    e.preventDefault();
    if (--dragCounter <= 0) {
      dragCounter = 0;
      document.body.classList.remove('dragging');
    }
  });

  addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('dragging');
    if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files);
  });

  const stripPngMetadata = bytes => {
    const stripTypes = ['iCCP', 'eXIf', 'tEXt', 'zTXt', 'iTXt', 'pHYs', 'tIME'];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks = [bytes.slice(0, 8)];
    let offset = 8;

    while (offset + 12 <= bytes.length) {
      const len = view.getUint32(offset, false);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      const totalChunkLen = 12 + len;
      if (offset + totalChunkLen > bytes.length) break;
      if (!stripTypes.includes(type)) chunks.push(bytes.slice(offset, offset + totalChunkLen));
      offset += totalChunkLen;
      if (type === 'IEND') break;
    }

    const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
    let pos = 0;
    chunks.forEach(c => { out.set(c, pos); pos += c.length; });
    return out;
  };

  const getOutputFilename = (originalName, dataUri) => {
    const match = dataUri.match(/^data:image\/([a-zA-Z0-9+.-]+);/);
    if (!match) return originalName;
    let ext = match[1].replace(/\+xml$/i, '');
    if (ext === 'jpeg') ext = 'jpg';
    return `${originalName.replace(/\.[^/.]+$/, '')}.${ext}`;
  };

  const encodeBytes = (bytes, mime) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:${mime};base64,${btoa(bin)}`;
  };

  const processImage = (file, compressionLevel) => new Promise((resolve, reject) => {
    const isLossless = compressionLevel === 0;
    const isSvg = file.type === 'image/svg+xml';

    if (isLossless && !isSvg) {
      if (file.type === 'image/png') {
        file.arrayBuffer().then(origBuf => {
          const stripped = stripPngMetadata(new Uint8Array(origBuf));
          resolve(encodeBytes(stripped, 'image/png'));
        }).catch(reject);
      } else {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }
      return;
    }

    const mimeType = isLossless ? 'image/png' : 'image/webp';

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = parseInt(maxDimSelect.value, 10);
        const width = img.naturalWidth || img.width || 512;
        const height = img.naturalHeight || img.height || 512;
        const scale = maxDim === 0
          ? 1
          : Math.min(1, maxDim / Math.max(width, height));

        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        const quality = Math.max(0.05, 1 - (compressionLevel / 100));
        canvas.toBlob(blob => {
          blob.arrayBuffer().then(buf => {
            let bytes = new Uint8Array(buf);
            if (bytes.length > 20) {
              const str = String.fromCharCode(...bytes.slice(0, 40));
              const iccpIdx = str.indexOf('ICCP');
              if (iccpIdx !== -1) {
                const view = new DataView(buf);
                const chunkSize = view.getUint32(iccpIdx + 4, true);
                const totalRemove = 8 + chunkSize + (chunkSize % 2);
                const cleaned = new Uint8Array(bytes.length - totalRemove);
                cleaned.set(bytes.slice(0, iccpIdx), 0);
                cleaned.set(bytes.slice(iccpIdx + totalRemove), iccpIdx);
                new DataView(cleaned.buffer).setUint32(4, cleaned.length - 8, true);
                if (String.fromCharCode(...cleaned.slice(12, 16)) === 'VP8X') cleaned[20] &= ~0x20;
                bytes = cleaned;
              }
            }
            resolve(encodeBytes(bytes, mimeType));
          });
        }, mimeType, quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const reprocessAllItems = async () => {
    const compressionLevel = parseInt(slider.value, 10);
    const cards = [...results.querySelectorAll('.item')];

    for (const card of cards) {
      const id = card.dataset.itemId;
      const origFile = originalFiles.get(id);
      if (!origFile || !origFile.type.startsWith('image/')) continue;

      try {
        const newDataUri = await processImage(origFile, compressionLevel);
        const origLen = parseInt(card.dataset.origLen, 10);
        const filename = card.dataset.filename;
        const ts = parseInt(card.dataset.ts, 10);

        card.querySelector('textarea').value = newDataUri;
        const img = card.querySelector('.item-title img');
        if (img) img.src = newDataUri;

        const titleSpan = card.querySelector('.item-title span');
        if (titleSpan) {
          titleSpan.textContent = `${filename} (${formatSizeStats(newDataUri.length, origLen)})`;
          titleSpan.style.color = newDataUri.length > 100 * 1024 ? 'hsl(35, 90%, 65%)' : '';
        }

        dbSaveItem({ id, filename, uri: newDataUri, orig: origLen, ts, file: origFile });
      } catch (err) {
        console.warn('Live re-encode failed:', err);
      }
    }
  };

  const processFiles = async fileList => {
    const compressionLevel = parseInt(slider.value, 10);
    const MAX_INPUT_BYTES = 10 * 1024 * 1024;

    for (const file of [...fileList]) {
      if (file.size > MAX_INPUT_BYTES) {
        alert(`Skipped "${file.name}" (${Math.round(file.size / 1024 / 1024)} MB). Maximum file size is 10 MB.`);
        continue;
      }

      const originalB64Length = Math.ceil(file.size / 3) * 4 + `data:${file.type || 'application/octet-stream'};base64,`.length;

      if (file.type.startsWith('image/')) {
        try {
          fileLoaded(file.name, await processImage(file, compressionLevel), originalB64Length, null, file);
          continue;
        } catch (err) {
          console.warn('Image processing skipped:', err);
        }
      }

      const reader = new FileReader();
      reader.onload = event => fileLoaded(file.name, event.target.result, originalB64Length, null, file);
      reader.readAsDataURL(file);
    }
  };

  addEventListener('paste', e => {
    if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const files = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split('/')[1] || 'png';
          const name = file.name && file.name !== 'image.png'
            ? file.name
            : `pasted-${Date.now()}.${ext}`;
          files.push(new File([file], name, { type: file.type }));
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      processFiles(files);
      return;
    }

    const pastedText = e.clipboardData.getData('text')?.trim();
    if (pastedText && /^https?:\/\/\S+/i.test(pastedText)) {
      e.preventDefault();
      fetchUrlToFile(pastedText);
    }
  });

  const formatSizeStats = (finalLen, originalLen) => {
    const finalKb = Math.round((finalLen / 1024) * 10) / 10;
    if (!originalLen || originalLen <= 0) return `${finalKb} KB`;

    const savedBytes = originalLen - finalLen;
    const savedKb = Math.round((Math.abs(savedBytes) / 1024) * 10) / 10;
    const pct = Math.round((Math.abs(savedBytes) / originalLen) * 100);

    if (savedBytes > 0) return `${finalKb} KB — saved ${savedKb} KB (${pct}%)`;
    if (savedBytes < 0) return `${finalKb} KB — +${savedKb} KB larger (${pct}%)`;
    return `${finalKb} KB — 0 KB saved`;
  };

  const copySvg = '<svg width="24" height="24" clip-rule="evenodd" fill="currentColor" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="m6 18h-3c-.48 0-1-.379-1-1v-14c0-.481.38-1 1-1h14c.621 0 1 .522 1 1v3h3c.621 0 1 .522 1 1v14c0 .621-.522 1-1 1h-14c-.48 0-1-.379-1-1zm1.5-10.5v13h13v-13zm9-1.5v-2.5h-13v13h2.5v-9.5c0-.481.38-1 1-1z" fill-rule="nonzero"></path></svg>';
  const downloadSvg = '<svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path><path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path></svg>';

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.assign(node, props);
    children.forEach(child => node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child));
    return node;
  };

  const showCopyTooltip = (wrapper, text) => {
    let tip = wrapper.querySelector('.copy-tooltip');
    if (!tip) {
      tip = el('div', { className: 'copy-tooltip', textContent: text });
      wrapper.appendChild(tip);
    } else {
      tip.textContent = text;
    }
    clearTimeout(tip._hideTimer);
    tip.classList.add('show');
    tip._hideTimer = setTimeout(() => tip.classList.remove('show'), 1200);
  };

  const fileLoaded = (filename, dataUri, originalLen, savedRecord = null, rawFile = null) => {
    const itemId = savedRecord?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const itemTs = savedRecord?.ts || Date.now();
    const sourceFile = savedRecord?.file || rawFile;
    if (sourceFile) originalFiles.set(itemId, sourceFile);

    const ta = el('textarea', { value: dataUri, onclick: () => ta.select() });

    const titleText = `${filename} (${formatSizeStats(dataUri.length, originalLen)})`;
    const textSpan = el('span', { textContent: titleText });
    if (dataUri.length > 100 * 1024) {
      textSpan.style.color = 'hsl(35, 90%, 65%)';
      textSpan.title = 'Large Data URI (>100 KB) — consider hosting as a separate file.';
    }

    const titleChildren = [];
    if (/^data:image/.test(dataUri)) {
      titleChildren.push(el('img', { src: dataUri }));
    }
    titleChildren.push(textSpan);
    const titleEl = el('div', { className: 'item-title' }, ...titleChildren);

    const copyWrap = el('span', { className: 'copy-wrap' });
    const copyBtn = el('button', {
      innerHTML: copySvg,
      title: 'Copy Data URI',
      className: 'copy-button',
      onclick: () => {
        ta.select();
        navigator.clipboard?.writeText(ta.value);
        showCopyTooltip(copyWrap, 'Copied!');
      },
    });
    copyWrap.appendChild(copyBtn);

    const copyCSSWrap = el('span', { className: 'copy-wrap' });
    const copyCSSBtn = el('button', {
      innerHTML: `${copySvg} CSS`,
      title: 'Copy as CSS background-image',
      className: 'copy-css-button',
      onclick: () => {
        const cssText = `background-image: url(${ta.value});`;
        navigator.clipboard?.writeText(cssText);
        showCopyTooltip(copyCSSWrap, 'CSS Copied!');
      },
    });
    copyCSSWrap.appendChild(copyCSSBtn);

    const downloadBtn = el('button', {
      innerHTML: downloadSvg,
      title: 'Download File',
      className: 'download-button',
      onclick: () => {
        const currentUri = ta.value;
        const link = el('a', {
          href: currentUri,
          download: getOutputFilename(filename, currentUri),
        });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      },
    });

    const removeBtn = el('button', {
      className: 'remove',
      innerHTML: '✖',
      title: 'Remove item',
      onclick: () => {
        originalFiles.delete(itemId);
        dbDeleteItem(itemId);
        results.removeChild(div);
      },
    });

    const actionsEl = el('div', { className: 'item-actions' }, copyWrap, copyCSSWrap, downloadBtn, removeBtn);
    const headerEl = el('div', { className: 'item-header' }, titleEl, actionsEl);

    const div = el('div', { className: 'item' }, headerEl, ta);
    div.dataset.itemId = itemId;
    div.dataset.filename = filename;
    div.dataset.origLen = originalLen || 0;
    div.dataset.ts = itemTs;
    results.prepend(div);

    if (!savedRecord) {
      dbSaveItem({ id: itemId, filename, uri: dataUri, orig: originalLen || 0, ts: itemTs, file: sourceFile });
    }
  };

  dbGetAllItems().then(items => {
    items
      .sort((a, b) => a.ts - b.ts)
      .forEach(item => fileLoaded(item.filename, item.uri, item.orig, item));
  }).catch(err => console.warn('IndexedDB restore skipped:', err));

  filePicker.onchange = () => {
    processFiles(filePicker.files);
    filePicker.value = '';
  };

  chooseFiles.onclick = () => filePicker.click();

  clearAll.onclick = () => {
    dbClearItems();
    originalFiles.clear();
    if (localStorage) {
      localStorage.removeItem('slider-compression');
      localStorage.removeItem('slider-max-dim');
    }
    results.innerHTML = '';
    slider.value = 50;
    maxDimSelect.value = '2048';
    syncSliderUI(false);
  };

  const fetchUrlToFile = async url => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const rawName = new URL(url).pathname.split('/').pop() || 'remote-image.png';
      const file = new File([blob], rawName, { type: blob.type || 'image/png' });
      processFiles([file]);
    } catch (err) {
      alert(`Could not fetch image URL: ${err.message}`);
      console.warn('Extension URL fetch failed:', err);
    }
  };

  const autoUrl = new URLSearchParams(location.search).get('url');
  if (autoUrl) {
    history.replaceState({}, '', location.pathname);
    fetchUrlToFile(autoUrl);
  }
})();
