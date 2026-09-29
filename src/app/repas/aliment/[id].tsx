import { useLocalSearchParams } from 'expo-router';

import { FoodForm } from '@/components/food-form';
import { deleteFood, getFood, updateFood } from '@/db/meals';
import { useDbMutation, useDbQuery } from '@/db/use-query';

/** Modifier un aliment du catalogue (les repas qui l'utilisent suivent). */
export default function EditFoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const foodId = Number(id);
  const mutate = useDbMutation();
  const { data: food, loadedKey } = useDbQuery((db) => getFood(db, foodId), id);
  if (!food || loadedKey !== id) return null;
  return (
    <FoodForm
      title="Modifier l'aliment"
      initial={food}
      onSave={async (d) => {
        await mutate((db) => updateFood(db, foodId, d));
      }}
      onDelete={async () => {
        await mutate((db) => deleteFood(db, foodId));
      }}
    />
  );
}
