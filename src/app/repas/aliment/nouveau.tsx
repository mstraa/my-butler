import { useLocalSearchParams } from 'expo-router';

import { EMPTY_FOOD, FoodForm } from '@/components/food-form';
import { createFood } from '@/db/meals';
import { useDbMutation } from '@/db/use-query';
import { setPendingFood } from '@/lib/meal-view';

/** Nouvel aliment du catalogue ; ouvert depuis l'ajout à un repas (`pick`), il y est proposé au retour. */
export default function NewFoodScreen() {
  const { name, pick } = useLocalSearchParams<{ name?: string; pick?: string }>();
  const mutate = useDbMutation();
  return (
    <FoodForm
      title="Nouvel aliment"
      initial={{ ...EMPTY_FOOD, name: name ?? '' }}
      onSave={async (d) => {
        const id = await mutate((db) => createFood(db, d));
        if (pick) setPendingFood(id);
      }}
    />
  );
}
