/** The shape of Alert.alert, so the flow can be driven without React Native. */
export type AskButton = { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void };
export type Ask = (title: string, message: string, buttons: AskButton[]) => void;

export const DELETE_TITLE = 'Delete this delivery?';
export const DELETE_MESSAGE =
  'Its video and extracted frames will also be deleted. This cannot be undone. ' +
  'Images already saved to your gallery or shared will remain.';

/**
 * Asks before deleting a delivery from a list, and deletes it only on confirm.
 * Refused outright while the list is picking deliveries to compare, so a long
 * press meant as a pick can never delete one. One delete at a time.
 */
export function createDeliveryDelete({
  ask,
  remove,
  onDeleted,
  onError,
}: {
  ask: Ask;
  remove: (id: string) => Promise<void>;
  onDeleted: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  let busy = false;
  return (id: string, selecting: boolean): boolean => {
    if (selecting || busy) return false;
    ask(DELETE_TITLE, DELETE_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (busy) return;
          busy = true;
          remove(id)
            .then(() => onDeleted(id), onError)
            .finally(() => {
              busy = false;
            });
        },
      },
    ]);
    return true;
  };
}
