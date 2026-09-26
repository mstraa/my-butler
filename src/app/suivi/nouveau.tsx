import { TrackerForm } from '@/components/tracker-form';
import { createTracker } from '@/db/tracking';
import { useDbMutation } from '@/db/use-query';

export default function NewTrackerScreen() {
  const mutate = useDbMutation();
  return (
    <TrackerForm
      title="Nouveau suivi"
      isNew
      initial={{ name: '', kind: 'quantity', unit: 'fois', step: 1, goal: null, icon: 'task', color: null }}
      onSave={async (d) => {
        await mutate((db) => createTracker(db, d));
      }}
    />
  );
}
