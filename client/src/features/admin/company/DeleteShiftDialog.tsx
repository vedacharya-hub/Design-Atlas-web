import type { CompanyShift } from '../../../api/types';
import { ConfirmPhraseDialog } from '../ConfirmPhraseDialog';
import { shiftTimings } from './companyShared';

interface Props {
  shift: CompanyShift;
  onCancel: () => void;
  /** Deletes the shift: true when it went through (the dialog is then closed), false to stay open. */
  onConfirm: () => Promise<boolean>;
}

/**
 * Delete “shift”? (Figma 3149:645418). Deleting cancels every booking made for the shift, so Delete
 * unlocks only once “Delete Shift” is typed.
 */
export function DeleteShiftDialog({ shift, onCancel, onConfirm }: Props) {
  return (
    <ConfirmPhraseDialog
      icon="/admin/company/delete-white.svg"
      title={<>Delete {shift.name}?</>}
      note="Deleting this shift will affect all bookings made for it — every booking within this shift will be cancelled. This can’t be undone."
      item={{ name: shift.name, meta: shiftTimings(shift, true) }}
      phrase="Delete Shift"
      confirmLabel="Delete"
      busyLabel="Deleting…"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
