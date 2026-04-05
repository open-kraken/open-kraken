import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestI18n } from '@/test/i18n-test-utils';
import { ProjectDataPanel } from '../features/roadmap-project-data/components/ProjectDataPanel';
import { RoadmapPanel } from '../features/roadmap-project-data/components/RoadmapPanel';
import {
  applyProjectDataSaveFailure,
  applyProjectDataSaveSuccess,
  applyRoadmapSaveFailure,
  applyRoadmapSaveSuccess,
  createProjectDataEditorState,
  createRoadmapEditorState,
  hydrateProjectDataState,
  hydrateRoadmapState,
  markProjectDataSaving,
  markRoadmapSaving,
  replaceRoadmapTasks,
  selectPanelFeedback,
  updateProjectDataDraftText,
  updateRoadmapObjective
} from '../features/roadmap-project-data/store';

test('roadmap save success normalizes ordering and save failure keeps local draft', () => {
  const loaded = hydrateRoadmapState({
    readOnly: false,
    storage: 'workspace',
    roadmap: {
      objective: 'Stabilize migration gates',
      tasks: [
        { id: 'b', number: 2, title: 'Second', status: 'todo', pinned: false },
        { id: 'a', number: 1, title: 'Pinned first', status: 'in_progress', pinned: true }
      ]
    }
  });

  const dirty = replaceRoadmapTasks(
    updateRoadmapObjective(loaded, 'Stabilize migration gates and rollout'),
    [
      { id: 'b', number: 2, title: 'Second updated', status: 'todo', pinned: false },
      { id: 'a', number: 1, title: 'Pinned first', status: 'done', pinned: true }
    ]
  );

  assert.equal(dirty.phase, 'dirty');

  const saving = markRoadmapSaving(dirty);
  const saved = applyRoadmapSaveSuccess({
    readOnly: false,
    storage: 'workspace',
    roadmap: {
      objective: dirty.draft.objective,
      tasks: [
        { id: 'b', number: 2, title: 'Second updated', status: 'todo', pinned: false },
        { id: 'a', number: 1, title: 'Pinned first', status: 'done', pinned: true }
      ]
    }
  });

  assert.equal(saving.phase, 'saving');
  assert.equal(saved.phase, 'loaded');
  assert.equal(saved.draft.tasks[0].id, 'a');
  assert.equal(saved.draft.tasks[1].id, 'b');

  const failed = applyRoadmapSaveFailure(dirty, 'version conflict');
  assert.equal(failed.phase, 'error');
  assert.equal(failed.saveError, 'version conflict');
  assert.equal(failed.draft.objective, 'Stabilize migration gates and rollout');
  assert.equal(failed.draft.tasks.find((task) => task.id === 'b')?.title, 'Second updated');
});

test('project data supports writable json editing and read-only lock feedback', () => {
  const writable = hydrateProjectDataState({
    payload: { projectName: 'open-kraken', release: { owner: 'Claire' } },
    storage: 'workspace',
    warning: ''
  });

  const edited = updateProjectDataDraftText(
    writable,
    JSON.stringify({ projectName: 'open-kraken', release: { owner: 'Planner' } }, null, 2)
  );

  assert.equal(edited.phase, 'dirty');
  assert.equal(edited.parseError, null);

  const saving = markProjectDataSaving(edited);
  const saved = applyProjectDataSaveSuccess({
    payload: { projectName: 'open-kraken', release: { owner: 'Planner' } },
    storage: 'app',
    warning: 'workspace path is temporarily unavailable'
  });

  assert.equal(saving.phase, 'saving');
  assert.equal(saved.phase, 'loaded');
  assert.equal(saved.persisted.storage, 'app');
  assert.match(saved.persisted.warning, /workspace path/i);

  const readOnly = hydrateProjectDataState({
    payload: { projectName: 'open-kraken' },
    storage: 'workspace',
    warning: 'using imported snapshot',
    readOnly: true,
    readOnlyReason: 'Imported snapshot is awaiting approval.'
  });
  const feedback = selectPanelFeedback({
    phase: readOnly.phase,
    warning: readOnly.persisted.warning,
    readOnlyReason: readOnly.persisted.readOnlyReason,
    reloadRequestedWhileDirty: false
  });

  assert.equal(feedback.tone, 'readonly');
  assert.equal(feedback.disableInputs, true);
  assert.equal(feedback.disableSave, true);
  assert.match(feedback.detail ?? '', /awaiting approval/i);
});

test('roadmap and project data panels share feedback semantics for loading, saving, readonly, and errors', () => {
  const neutral = selectPanelFeedback({
    phase: 'dirty',
    warning: '',
    readOnlyReason: null,
    reloadRequestedWhileDirty: true
  });
  const errorFeedback = selectPanelFeedback({
    phase: 'error',
    warning: '',
    readOnlyReason: null,
    saveError: 'save failed',
    reloadRequestedWhileDirty: false
  });

  const roadmapMarkup = renderToStaticMarkup(
    <TestI18n>
      <RoadmapPanel
        value={{
          objective: 'Goal',
          tasks: [{ id: 'task_1', number: 1, title: 'First', status: 'todo', pinned: true }]
        }}
        feedback={neutral}
        onObjectiveChange={() => undefined}
        onTaskChange={() => undefined}
        onSave={() => undefined}
        onReload={() => undefined}
        onKeepDraft={() => undefined}
        onDiscardAndReload={() => undefined}
      />
    </TestI18n>
  );

  const projectMarkup = renderToStaticMarkup(
    <TestI18n>
      <ProjectDataPanel
        value={{ payload: { owner: 'Claire' }, storage: 'workspace', warning: '', readOnlyReason: null }}
        draftText={'{\n  "owner": "Claire"\n}'}
        feedback={errorFeedback}
        onDraftChange={() => undefined}
        onSave={() => undefined}
        onReload={() => undefined}
        onKeepDraft={() => undefined}
        onDiscardAndReload={() => undefined}
      />
    </TestI18n>
  );

  assert.match(roadmapMarkup, /Keep local draft/);
  assert.match(roadmapMarkup, /Discard and reload/);
  assert.match(projectMarkup, /Action required/);
  assert.match(projectMarkup, /Save project data/);
});
