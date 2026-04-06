import { useMemo } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { RoadmapTaskItem } from '../api-client';
import styles from '../roadmap-feature.module.css';

export type RoadmapProgressSummaryProps = {
  tasks: RoadmapTaskItem[];
};

export const RoadmapProgressSummary = ({ tasks }: RoadmapProgressSummaryProps) => {
  const { t } = useI18n();

  const stats = useMemo(() => {
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const blocked = tasks.filter((t) => t.status === 'blocked').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, inProgress, done, blocked, percent };
  }, [tasks]);

  return (
    <div className={styles['roadmap-progress']}>
      <div className={styles['roadmap-progress__cards']}>
        <div className={styles['roadmap-progress__card']}>
          <span className={styles['roadmap-progress__card-label']}>{t('roadmapPanel.progressTotal')}</span>
          <strong className={styles['roadmap-progress__card-value']}>{stats.total}</strong>
        </div>
        <div className={styles['roadmap-progress__card']}>
          <span className={styles['roadmap-progress__card-label']}>{t('taskStatus.in_progress')}</span>
          <strong className={`${styles['roadmap-progress__card-value']} ${styles['roadmap-progress__card-value--in_progress']}`}>
            {stats.inProgress}
          </strong>
        </div>
        <div className={styles['roadmap-progress__card']}>
          <span className={styles['roadmap-progress__card-label']}>{t('roadmapPanel.progressDone')}</span>
          <strong className={`${styles['roadmap-progress__card-value']} ${styles['roadmap-progress__card-value--done']}`}>
            {stats.done}
          </strong>
        </div>
        <div className={styles['roadmap-progress__card']}>
          <span className={styles['roadmap-progress__card-label']}>{t('roadmapPanel.progressBlocked')}</span>
          <strong className={`${styles['roadmap-progress__card-value']} ${styles['roadmap-progress__card-value--blocked']}`}>
            {stats.blocked}
          </strong>
        </div>
      </div>

      <div className={styles['roadmap-progress__bar']}>
        <div className={styles['roadmap-progress__bar-fill']} style={{ width: `${stats.percent}%` }} />
      </div>
      <p className={styles['roadmap-progress__percent']}>
        {t('roadmapPanel.progressCompletion', { percent: stats.percent })}
      </p>
    </div>
  );
};
