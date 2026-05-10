/* ===========================================
   quiz-fragments.js
   答题与批注组件 — 片段二级步进
   依赖：quiz-core.js、quiz-constants.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 模块级变量 === */
  var noteFragmentState = new WeakMap();
  var fragmentIdentityKeys = new WeakMap();
  var fragmentIdentitySeed = 0;
  var fragmentGroupSeed = 0;

  /* =========================================
     内部工具函数
     ========================================= */

  function normalizeFragmentSelectionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  /* =========================================
     片段归属与标识
     ========================================= */

  QA.getFragmentOwnerLinkId = function (fragment) {
    var ownerAnchor = fragment ? fragment.closest('.text-anchor, .answer-anchor') : null;
    if (!ownerAnchor) return '';
    return ownerAnchor.getAttribute('data-link-answer') || ownerAnchor.getAttribute('data-link') || '';
  };

  QA.getFragmentOwnerAnchor = function (node) {
    var root = QA.getSelectionRootNode(node);
    return root && root.closest ? root.closest('.text-anchor, .answer-anchor') : null;
  };

  QA.getFragmentTargetsForBubble = function (bubble) {
    if (!bubble) return [];
    var qa = bubble.closest('.quiz-annotation');
    var linkId = bubble.getAttribute('data-link');
    if (!qa || !linkId) return [];

    var targets = [];
    var leftAnchor = QA.getAnchorByLink(qa, linkId);
    if (leftAnchor) targets.push(leftAnchor);
    qa.querySelectorAll('.answer-anchor[data-link-answer="' + linkId + '"], .answer-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
      if (targets.indexOf(anchor) === -1) targets.push(anchor);
    });
    return targets;
  };

  QA.getFragmentIdentityKey = function (fragment) {
    if (!fragment) return '';
    var groupId = fragment.getAttribute('data-fragment-group');
    if (groupId) return 'group:' + groupId;
    if (!fragmentIdentityKeys.has(fragment)) {
      fragmentIdentitySeed += 1;
      fragmentIdentityKeys.set(fragment, 'single:' + fragmentIdentitySeed);
    }
    return fragmentIdentityKeys.get(fragment);
  };

  function getNextFragmentGroupId(qa) {
    if (qa) {
      qa.querySelectorAll('[data-fragment-group]').forEach(function (fragment) {
        var match = String(fragment.getAttribute('data-fragment-group') || '').match(/^frag-group-(\d+)$/);
        if (match) fragmentGroupSeed = Math.max(fragmentGroupSeed, Number(match[1]));
      });
    }
    fragmentGroupSeed += 1;
    return 'frag-group-' + fragmentGroupSeed;
  }

  function ensureFragmentGroup(fragment, qa) {
    if (!fragment) return getNextFragmentGroupId(qa);
    var groupId = fragment.getAttribute('data-fragment-group');
    if (!groupId) {
      groupId = getNextFragmentGroupId(qa);
      fragment.setAttribute('data-fragment-group', groupId);
    }
    return groupId;
  }

  QA.resolveSelectedFragmentGroupId = function (qa, range, commonNode) {
    var fragmentRoot = commonNode && commonNode.closest ? commonNode.closest('[data-fragment-step="true"]') : null;
    if (fragmentRoot) return ensureFragmentGroup(fragmentRoot, qa);
    return getNextFragmentGroupId(qa);
  };

  /* =========================================
     片段展示标准化
     ========================================= */

  function normalizeFragmentPresentation(fragment) {
    if (!fragment || fragment.dataset.fragmentPresentationReady === 'true') return;

    var formatType = fragment.getAttribute('data-fragment-format');
    if (formatType === 'color') {
      var authoredColor = fragment.style.getPropertyValue('--qa-fragment-color') || fragment.style.color || fragment.dataset.fragmentColor || '';
      if (authoredColor) {
        fragment.style.setProperty('--qa-fragment-color', authoredColor);
        fragment.dataset.fragmentColor = authoredColor;
      }
      fragment.style.color = '';
    } else if (formatType === 'highlight') {
      var authoredHighlight = fragment.style.getPropertyValue('--qa-fragment-highlight') || fragment.style.backgroundColor || fragment.dataset.fragmentHighlight || '';
      if (authoredHighlight) {
        fragment.style.setProperty('--qa-fragment-highlight', authoredHighlight);
        fragment.dataset.fragmentHighlight = authoredHighlight;
      }
      fragment.style.backgroundColor = '';
    } else if (formatType === 'strikethrough') {
      var authoredStrikeColor = QA.normalizeStrikethroughColor(fragment.style.getPropertyValue('--qa-fragment-strike-color') || fragment.style.textDecorationColor || fragment.dataset.fragmentStrikeColor);
      var authoredStrikeThickness = QA.normalizeStrikethroughThickness(fragment.style.getPropertyValue('--qa-fragment-strike-thickness') || fragment.style.textDecorationThickness || fragment.dataset.fragmentStrikeThickness);
      fragment.style.setProperty('--qa-fragment-strike-color', authoredStrikeColor);
      fragment.style.setProperty('--qa-fragment-strike-thickness', authoredStrikeThickness);
      fragment.dataset.fragmentStrikeColor = authoredStrikeColor;
      fragment.dataset.fragmentStrikeThickness = authoredStrikeThickness;
      fragment.style.textDecoration = '';
      fragment.style.textDecorationColor = '';
      fragment.style.textDecorationThickness = '';
    }

    fragment.dataset.fragmentPresentationReady = 'true';
  }

  /* =========================================
     片段条目管理
     ========================================= */

  QA.getNoteFragmentEntries = function (bubble) {
    if (!bubble) return [];

    var entries = [];
    var entryMap = new Map();
    QA.getFragmentTargetsForBubble(bubble).forEach(function (target) {
      target.querySelectorAll('[data-fragment-step="true"]').forEach(function (fragment) {
        normalizeFragmentPresentation(fragment);
        var key = QA.getFragmentIdentityKey(fragment);
        if (!entryMap.has(key)) {
          var entry = { key: key, fragments: [] };
          entryMap.set(key, entry);
          entries.push(entry);
        }
        entryMap.get(key).fragments.push(fragment);
      });
    });
    return entries;
  };

  QA.getNoteFragmentState = function (bubble) {
    if (!bubble) return null;
    if (!noteFragmentState.has(bubble)) {
      noteFragmentState.set(bubble, {
        cursor: -1,
        visible: new Set()
      });
    }
    return noteFragmentState.get(bubble);
  };

  QA.getNoteFragments = function (bubble) {
    if (!bubble) return [];
    return QA.getNoteFragmentEntries(bubble).map(function (entry) {
      return entry.fragments[0];
    });
  };

  QA.syncNoteFragments = function (bubble) {
    if (!bubble) return;
    var state = QA.getNoteFragmentState(bubble);
    var forceVisible = QA.isEditorMode();
    QA.getNoteFragmentEntries(bubble).forEach(function (entry, index) {
      var visible = forceVisible || state.visible.has(index);
      entry.fragments.forEach(function (fragment) {
        fragment.classList.toggle('qa-fragment-visible', visible);
      });
    });
  };

  QA.resetNoteFragments = function (bubble) {
    if (!bubble) return;
    var state = QA.getNoteFragmentState(bubble);
    state.cursor = -1;
    state.visible.clear();
    QA.syncNoteFragments(bubble);
  };

  /* =========================================
     片段步进
     ========================================= */

  QA.revealNextNoteFragment = function (qa) {
    var bubble = qa ? qa.querySelector('.qa-note-bubble.note-active') : null;
    var entries = QA.getNoteFragmentEntries(bubble);
    if (!bubble || entries.length === 0) return false;

    var state = QA.getNoteFragmentState(bubble);
    if (state.cursor >= entries.length - 1) return false;

    state.cursor += 1;
    state.visible.add(state.cursor);
    QA.syncNoteFragments(bubble);
    QA.playFragmentStepSound('forward', 'step');
    return true;
  };

  QA.hidePreviousNoteFragment = function (qa) {
    var bubble = qa ? qa.querySelector('.qa-note-bubble.note-active') : null;
    if (!bubble) return false;

    var state = QA.getNoteFragmentState(bubble);
    var visibleIndexes = Array.from(state.visible).sort(function (a, b) { return a - b; });
    if (visibleIndexes.length === 0) return false;

    var hideIndex = visibleIndexes[visibleIndexes.length - 1];
    state.visible.delete(hideIndex);
    if (hideIndex <= state.cursor) {
      state.cursor = hideIndex - 1;
    }
    QA.syncNoteFragments(bubble);
    QA.playFragmentStepSound('backward', 'step');
    return true;
  };

  QA.revealNoteFragmentImmediately = function (fragment) {
    if (!fragment) return false;
    var ownerLinkId = QA.getFragmentOwnerLinkId(fragment);
    var qa = fragment.closest('.quiz-annotation');
    var bubble = qa && ownerLinkId ? QA.getBubbleByLink(qa, ownerLinkId) : null;
    var targetKey = QA.getFragmentIdentityKey(fragment);
    var entries = QA.getNoteFragmentEntries(bubble);
    var index = entries.findIndex(function (entry) { return entry.key === targetKey; });
    if (!bubble || index === -1) return false;

    var state = QA.getNoteFragmentState(bubble);
    state.visible.add(index);
    QA.syncNoteFragments(bubble);
    QA.playFragmentStepSound('forward', 'immediate-reveal');
    return true;
  };

  QA.normalizeFragmentSelectionText = normalizeFragmentSelectionText;

})();
