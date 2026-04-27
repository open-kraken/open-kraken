import { useI18n } from '@/i18n/I18nProvider';
import type { RoadmapTaskStatus } from '../api-client';
import styles from '../roadmap-feature.module.css';

export type ViewMode = 'map' | 'list' | 'kanban';
export type StatusFilter = RoadmapTaskStatus | 'all';

const FILTER_OPTIONS: StatusFilter[] = ['all', 'todo', 'in_progress', 'done', 'blocked'];

export type RoadmapToolbarProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onAddTask: () => void;
  disableAdd: boolean;
};

export const RoadmapToolbar = ({
  viewMode,
  onViewModeChange,
  statusFilter,
  onStatusFilterChange,
  onAddTask,
  disableAdd
}: RoadmapToolbarProps) => {
  const { t } = useI18n();

  return (
    <div className={styles['roadmap-toolbar']}>
      <div className={styles['roadmap-toolbar__group']}>
        <button
          type="button"
          className={`${styles['roadmap-toolbar__btn']}${viewMode === 'map' ? ` ${styles['roadmap-toolbar__btn--active']}` : ''}`}
          onClick={() => onViewModeChange('map')}
          aria-pressed={viewMode === 'map'}
        >
          {t('roadmapPanel.viewMap')}
        </button>
        <button
          type="button"
          className={`${styles['roadmap-toolbar__btn']}${viewMode === 'list' ? ` ${styles['roadmap-toolbar__btn--active']}` : ''}`}
          onClick={() => onViewModeChange('list')}
          aria-pressed={viewMode === 'list'}
        >
          {t('roadmapPanel.viewList')}
        </button>
        <button
          type="button"
          className={`${styles['roadmap-toolbar__btn']}${viewMode === 'kanban' ? ` ${styles['roadmap-toolbar__btn--active']}` : ''}`}
          onClick={() => onViewModeChange('kanban')}
          aria-pressed={viewMode === 'kanban'}
        >
          {t('roadmapPanel.viewKanban')}
        </button>
      </div>

      <div className={styles['roadmap-toolbar__group']}>
        {FILTER_OPTIONS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`${styles['roadmap-toolbar__btn']}${statusFilter === filter ? ` ${styles['roadmap-toolbar__btn--active']}` : ''}`}
            onClick={() => onStatusFilterChange(filter)}
            aria-pressed={statusFilter === filter}
          >
            {filter === 'all' ? t('roadmapPanel.filterAll') : t(`taskStatus.${filter}`)}
          </button>
        ))}
      </div>

      <div className={styles['roadmap-toolbar__spacer']} />

      <button
        type="button"
        className={styles['roadmap-toolbar__add-btn']}
        onClick={onAddTask}
        disabled={disableAdd}
      >
        + {t('roadmapPanel.addTask')}
      </button>
    </div>
  );
};
