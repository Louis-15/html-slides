/* ===========================================
   quiz-matching.js
   答题与批注组件 — 阅读七选五（连线拖拽）
   依赖：quiz-core.js、quiz-base.js、quiz-single.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     正文空位结构维护
     ========================================= */

  QA.ensureMatchingPassageSlotStructure = function (slot) {
    if (!slot) return null;

    slot.classList.add('qa-matching-passage-slot');
    QA.trimBlankSlotWhitespaces(slot);

    var userSpan = slot.querySelector('.qa-blank-user');
    if (!userSpan) {
      userSpan = document.createElement('span');
      userSpan.className = 'qa-blank-user';
      slot.prepend(userSpan);
    }

    var sup = userSpan.querySelector('sup');
    if (!sup) {
      sup = document.createElement('sup');
      sup.textContent = slot.dataset.blankId || '';
    } else if (!sup.textContent && slot.dataset.blankId) {
      sup.textContent = slot.dataset.blankId;
    }

    var valueSpan = userSpan.querySelector('.qa-blank-value');
    if (!valueSpan) {
      valueSpan = document.createElement('span');
      valueSpan.className = 'qa-blank-value';
    }

    userSpan.textContent = '';
    userSpan.appendChild(sup);
    userSpan.appendChild(valueSpan);

    var answerSpan = slot.querySelector('.qa-blank-answer');
    if (!answerSpan) {
      answerSpan = document.createElement('span');
      answerSpan.className = 'qa-blank-answer';
      slot.appendChild(answerSpan);
    }
    answerSpan.textContent = '';
    answerSpan.style.display = 'none';

    slot.querySelectorAll('.qa-result-mark, .qa-blank-correct').forEach(function (el) { return el.remove(); });
    slot.classList.remove('result-correct', 'result-incorrect', 'slot-answered');

    return { userSpan: userSpan, valueSpan: valueSpan };
  };

  QA.renderMatchingPassageSlot = function (slot, showCorrectAnswer) {
    var structure = QA.ensureMatchingPassageSlotStructure(slot);
    if (!structure) return;

    var valueSpan = structure.valueSpan;
    slot.classList.toggle('show-correct-answer', !!showCorrectAnswer);
    valueSpan.textContent = showCorrectAnswer ? (slot.dataset.correctAnswer || '') : '';
  };

  /* =========================================
     右栏答题槽位值管理
     ========================================= */

  QA.setMatchingAnswerSlotValue = function (slot, optionId) {
    if (!slot) return;

    var blankEl = slot.querySelector('.qa-slot-blank');
    if (!blankEl) return;

    var valueEl = blankEl.querySelector('.qa-slot-value');
    if (!valueEl) {
      valueEl = document.createElement('span');
      valueEl.className = 'qa-slot-value';
      blankEl.appendChild(valueEl);
    }

    valueEl.textContent = optionId || '';
    slot.classList.toggle('filled', !!optionId);
    if (optionId) {
      slot.dataset.userAnswer = optionId;
    } else {
      delete slot.dataset.userAnswer;
    }
  };

  /* =========================================
     连线题结果渲染
     ========================================= */

  QA.renderMatchingAnswerResults = function (qa) {
    qa.querySelectorAll('.qa-answer-slot[data-correct-answer]').forEach(function (slot) {
      var correctAnswer = slot.dataset.correctAnswer || '';
      var userAnswer = slot.dataset.userAnswer || '';
      var isAnswered = !!userAnswer;
      var isCorrect = isAnswered && userAnswer.toUpperCase() === correctAnswer.toUpperCase();
      var blankEl = slot.querySelector('.qa-slot-blank');
      if (!blankEl) return;

      slot.classList.remove('slot-correct', 'slot-incorrect');
      blankEl.querySelectorAll('.qa-slot-mark').forEach(function (el) { return el.remove(); });
      slot.querySelectorAll('.qa-slot-correct, .qa-slot-feedback').forEach(function (el) { return el.remove(); });

      if (isCorrect) {
        slot.classList.add('slot-correct');
        var markEl = document.createElement('span');
        markEl.className = 'qa-slot-mark correct';
        markEl.textContent = '✓';
        blankEl.appendChild(markEl);
      } else {
        slot.classList.add('slot-incorrect');
      }

      if (isAnswered && !isCorrect) {
        var markEl = document.createElement('span');
        markEl.className = 'qa-slot-mark incorrect';
        markEl.textContent = '✗';
        blankEl.appendChild(markEl);
      }

      // 连线题未作答时也给出明确文本胶囊
      if (!isAnswered) {
        var feedbackEl = document.createElement('span');
        feedbackEl.className = 'qa-slot-feedback unanswered';
        feedbackEl.textContent = '未作答';
        slot.appendChild(feedbackEl);
      }

      if (!isCorrect) {
        var correctEl = document.createElement('span');
        correctEl.className = 'qa-slot-correct';
        correctEl.innerHTML = '<span class="qa-slot-correct-prefix">正确选项：</span>' + correctAnswer;
        slot.appendChild(correctEl);
      }
    });
  };

  /** 连线题提交后仍允许用户点击已填写槽位重新作答 */
  QA.unlockMatchingSubmissionState = function (qa) {
    if (!qa || !qa.classList.contains('submitted')) return;

    qa.classList.remove('submitted');

    var submitBtn = qa.querySelector('.qa-submit-btn');
    if (submitBtn) submitBtn.disabled = false;

    QA.syncMatchingAnswerUI(qa, { resetTransientState: false });
  };

  /** 统一清空某个 blankId 对应的连线答案 */
  QA.clearMatchingAnswerByBlankId = function (qa, blankId) {
    if (!qa || !blankId) return false;

    var answerSlot = qa.querySelector('.qa-answer-slot[data-blank-id="' + blankId + '"]');
    var passageSlot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="' + blankId + '"]');
    var usedOption = (answerSlot && answerSlot.dataset.userAnswer) || (passageSlot && passageSlot.dataset.userAnswer) || '';
    if (!usedOption) return false;

    var dragOpt = qa.querySelector('.qa-question[data-type="matching"] .qa-option[data-option="' + usedOption + '"]');
    if (dragOpt) dragOpt.classList.remove('used');

    if (answerSlot) {
      QA.setMatchingAnswerSlotValue(answerSlot, '');
    }
    QA.clearPassageSlot(qa, blankId);
    return true;
  };

  QA.resetMatchingQuestionState = function (qa) {
    if (!qa) return;

    qa.querySelectorAll('.qa-passage .qa-blank-slot[data-correct-answer]').forEach(function (slot) {
      delete slot.dataset.userAnswer;
      slot.classList.remove('filled', 'slot-answered', 'result-correct', 'result-incorrect', 'show-correct-answer');
      slot.querySelectorAll('.qa-result-mark, .qa-blank-correct').forEach(function (el) { return el.remove(); });

      var answerSpan = slot.querySelector('.qa-blank-answer');
      if (answerSpan) {
        answerSpan.textContent = '';
        answerSpan.style.display = 'none';
      }

      QA.renderMatchingPassageSlot(slot, false);
    });

    qa.querySelectorAll('.qa-answer-slot').forEach(function (slot) {
      slot.classList.remove('filled', 'slot-correct', 'slot-incorrect', 'drag-over');
      delete slot.dataset.userAnswer;
      slot.querySelectorAll('.qa-slot-correct, .qa-slot-feedback').forEach(function (el) { return el.remove(); });
      var blankEl = slot.querySelector('.qa-slot-blank');
      if (blankEl) {
        blankEl.querySelectorAll('.qa-slot-mark').forEach(function (el) { return el.remove(); });
      }
      QA.setMatchingAnswerSlotValue(slot, '');
    });

    qa.querySelectorAll('.qa-question[data-type="matching"] .qa-option').forEach(function (option) {
      option.classList.remove('used', 'selected', 'result-correct', 'result-incorrect');
      option.querySelectorAll('.qa-result-mark').forEach(function (el) { return el.remove(); });
    });
  };

  /** 同步右栏槽位答案到正文空位 */
  QA.syncSlotToPassage = function (qa, blankId, optionId) {
    var passageSlot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="' + blankId + '"]');
    if (!passageSlot) return;
    passageSlot.dataset.userAnswer = optionId;
    passageSlot.classList.add('filled');
    if (qa.querySelector('.qa-question[data-type="matching"]')) {
      QA.renderMatchingPassageSlot(passageSlot, qa.classList.contains('submitted'));
      return;
    }

    var userSpan = passageSlot.querySelector('.qa-blank-user');
    if (userSpan) {
      var sup = passageSlot.querySelector('sup');
      userSpan.textContent = optionId + ' ';
      if (sup) userSpan.appendChild(sup);
    }
  };

  /** 清除正文空位的答案 */
  QA.clearPassageSlot = function (qa, blankId) {
    var passageSlot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="' + blankId + '"]');
    if (!passageSlot) return;
    delete passageSlot.dataset.userAnswer;
    passageSlot.classList.remove('filled');
    if (qa.querySelector('.qa-question[data-type="matching"]')) {
      QA.renderMatchingPassageSlot(passageSlot, qa.classList.contains('submitted'));
      return;
    }

    var userSpan = passageSlot.querySelector('.qa-blank-user');
    if (userSpan) {
      var sup = passageSlot.querySelector('sup');
      userSpan.textContent = '___';
      if (sup) userSpan.appendChild(sup);
    }
  };

  /* =========================================
     连线题（七选五）UI 同步
     ========================================= */

  QA.syncMatchingAnswerUI = function (qa, options) {
    if (!qa) return;

    var settings = options || {};
    var matchingQuestion = qa.querySelector('.qa-question[data-type="matching"]');
    if (!matchingQuestion) return;

    var passageSlots = Array.from(qa.querySelectorAll('.qa-passage .qa-blank-slot[data-correct-answer]'));
    if (passageSlots.length === 0) return;

    var answerContent = qa.querySelector('.qa-answer-content');
    if (!answerContent) return;

    if (settings.resetTransientState && !qa.classList.contains('submitted')) {
      QA.resetMatchingQuestionState(qa);
    }

    passageSlots.forEach(function (slot) {
      QA.renderMatchingPassageSlot(slot, qa.classList.contains('submitted') && !QA.isEditorMode());
    });

    var optionsScroll = answerContent.querySelector('.qa-answer-options-scroll');
    if (!optionsScroll) {
      optionsScroll = document.createElement('div');
      optionsScroll.className = 'qa-answer-options-scroll';
      optionsScroll.setAttribute('data-scrollable', '');
      if (matchingQuestion.parentNode === answerContent) {
        answerContent.appendChild(optionsScroll);
      }
      optionsScroll.appendChild(matchingQuestion);
    } else if (matchingQuestion.parentNode !== optionsScroll) {
      optionsScroll.appendChild(matchingQuestion);
    }

    if (!optionsScroll.dataset.connectorScrollBound) {
      optionsScroll.addEventListener('scroll', function () {
        window.requestAnimationFrame(function () {
          var activeBubble = qa.querySelector('.qa-note-bubble.note-active');
          if (activeBubble && qa.classList.contains('notes-active')) {
            QA.drawStepConnectors(qa, activeBubble);
          }
        });
      });
      optionsScroll.dataset.connectorScrollBound = 'true';
    }

    var slotsContainer = answerContent.querySelector('.qa-answer-slots');
    if (!slotsContainer) {
      slotsContainer = document.createElement('div');
      slotsContainer.className = 'qa-answer-slots';
    }
    slotsContainer.innerHTML = '';

    var optionIds = Array.from(matchingQuestion.querySelectorAll('.qa-option'))
      .map(function (option) { return option.getAttribute('data-option'); })
      .filter(Boolean);

    matchingQuestion.querySelectorAll('.qa-option').forEach(function (opt) {
      opt.classList.remove('used');

      if (!opt.dataset.qaMatchingDragBound) {
        opt.addEventListener('dragstart', function (e) {
          if (QA.isEditorMode()) { e.preventDefault(); return; }
          if (qa.classList.contains('submitted')) { e.preventDefault(); return; }
          if (opt.classList.contains('used')) { e.preventDefault(); return; }
          e.dataTransfer.setData('text/plain', opt.dataset.option);
          e.dataTransfer.effectAllowed = 'copy';
          opt.classList.add('dragging');
        });
        opt.addEventListener('dragend', function () {
          opt.classList.remove('dragging');
          slotsContainer.querySelectorAll('.qa-answer-slot').forEach(function (s) { return s.classList.remove('drag-over'); });
        });
        opt.dataset.qaMatchingDragBound = 'true';
      }
    });

    QA.syncMatchingOptionDragState(qa);

    passageSlots.forEach(function (pSlot) {
      if (pSlot.dataset.qaMatchingClickBound === 'true') return;
      pSlot.dataset.qaMatchingClickBound = 'true';

      pSlot.addEventListener('click', function () {
        if (QA.isEditorMode()) return;

        var blankId = pSlot.dataset.blankId || '';
        if (!blankId) return;

        var currentPassageSlot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="' + blankId + '"]');
        if (!currentPassageSlot || !currentPassageSlot.classList.contains('filled')) return;

        if (qa.classList.contains('submitted')) return;

        QA.clearMatchingAnswerByBlankId(qa, blankId);
      });
    });

    passageSlots.forEach(function (pSlot) {
      var blankId = pSlot.dataset.blankId || '';
      var correctAnswer = pSlot.dataset.correctAnswer || '';
      var userAnswer = pSlot.dataset.userAnswer || '';
      var slot = document.createElement('div');
      slot.className = 'qa-answer-slot';
      slot.dataset.blankId = blankId;
      slot.dataset.correctAnswer = correctAnswer;

      if (QA.isEditorMode()) {
        slot.classList.add('qa-answer-key-slot');

        var label = document.createElement('span');
        label.className = 'qa-slot-label';
        label.textContent = blankId + '.';

        var chips = document.createElement('div');
        chips.className = 'qa-answer-key-options';

        optionIds.forEach(function (optionId) {
          var chip = QA.createAnswerKeyChip(optionId, optionId === correctAnswer);
          chip.addEventListener('click', function () {
            if (!QA.isEditorMode()) return;
            if ((pSlot.dataset.correctAnswer || '') === optionId) return;

            QA.resetQuizSubmissionState(qa);

            passageSlots.forEach(function (otherSlot) {
              if (otherSlot === pSlot) return;
              if ((otherSlot.dataset.correctAnswer || '') !== optionId) return;

              otherSlot.setAttribute('data-correct-answer', '');
              QA.renderMatchingPassageSlot(otherSlot, false);

              var otherAnswerSlot = slotsContainer.querySelector('.qa-answer-slot[data-blank-id="' + otherSlot.dataset.blankId + '"]');
              if (otherAnswerSlot) {
                otherAnswerSlot.setAttribute('data-correct-answer', '');
                QA.updateAnswerKeyChipSelection(otherAnswerSlot.querySelector('.qa-answer-key-options'), []);
              }
            });

            pSlot.setAttribute('data-correct-answer', optionId);
            slot.setAttribute('data-correct-answer', optionId);
            QA.renderMatchingPassageSlot(pSlot, false);
            QA.updateAnswerKeyChipSelection(chips, [optionId]);
            QA.persistQuizAuthoringChange();
          });
          chips.appendChild(chip);
        });

        slot.appendChild(label);
        slot.appendChild(chips);
      } else {
        slot.innerHTML = '' +
          '<span class="qa-slot-label">' + blankId + '.</span>' +
          '<span class="qa-slot-blank"><span class="qa-slot-value"></span></span>';
        QA.setMatchingAnswerSlotValue(slot, userAnswer);
        if (userAnswer) {
          var usedOpt = matchingQuestion.querySelector('.qa-option[data-option="' + userAnswer + '"]');
          if (usedOpt) usedOpt.classList.add('used');
        }
      }

      slotsContainer.appendChild(slot);
    });

    if (slotsContainer.parentNode !== answerContent) {
      answerContent.insertBefore(slotsContainer, optionsScroll);
    }

    var divider = answerContent.querySelector('.qa-slots-divider');
    if (!divider) {
      divider = document.createElement('div');
      divider.className = 'qa-slots-divider';
    }
    divider.textContent = QA.isEditorMode() ? '↑ 点击设置每个空位的正确答案 ↓' : '↑ 将下方选项拖入上方槽位 ↓';
    answerContent.insertBefore(divider, optionsScroll);

    if (QA.isEditorMode()) {
      return;
    }

    slotsContainer.querySelectorAll('.qa-answer-slot').forEach(function (slot) {
      slot.addEventListener('dragover', function (e) {
        if (qa.classList.contains('submitted')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', function () {
        slot.classList.remove('drag-over');
      });
      slot.addEventListener('drop', function (e) {
        e.preventDefault();
        slot.classList.remove('drag-over');
        if (qa.classList.contains('submitted')) return;

        var optionId = e.dataTransfer.getData('text/plain');
        if (!optionId) return;

        var oldAnswer = slot.dataset.userAnswer;
        if (oldAnswer) {
          var oldOpt = matchingQuestion.querySelector('.qa-option[data-option="' + oldAnswer + '"]');
          if (oldOpt) oldOpt.classList.remove('used');
        }

        slotsContainer.querySelectorAll('.qa-answer-slot').forEach(function (s) {
          if (s.dataset.userAnswer === optionId) {
            QA.setMatchingAnswerSlotValue(s, '');
          }
        });

        QA.setMatchingAnswerSlotValue(slot, optionId);

        var dragOpt = matchingQuestion.querySelector('.qa-option[data-option="' + optionId + '"]');
        if (dragOpt) dragOpt.classList.add('used');

        QA.syncSlotToPassage(qa, slot.dataset.blankId, optionId);
      });

      slot.addEventListener('click', function () {
        if (QA.isEditorMode()) return;

        var blankId = slot.dataset.blankId || '';
        if (!blankId) return;

        var currentSlot = qa.querySelector('.qa-answer-slot[data-blank-id="' + blankId + '"]');
        if (!currentSlot || !currentSlot.classList.contains('filled')) return;

        if (qa.classList.contains('submitted')) return;

        QA.clearMatchingAnswerByBlankId(qa, blankId);
      });
    });

    if (qa.classList.contains('submitted')) {
      QA.renderMatchingAnswerResults(qa);
    }
  };

})();
