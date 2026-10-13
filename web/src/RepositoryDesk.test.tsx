// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RepositoryDesk from './RepositoryDesk';
import { QUEUE_KEY } from './intake';

const register = vi.fn(async () => {});
function renderDesk() { return render(<RepositoryDesk local={false} intakeReady={false} liveReady={false} onReplay={vi.fn()} onGuide={vi.fn()} onRegister={register} />); }
beforeEach(() => { localStorage.clear(); register.mockClear(); });
afterEach(cleanup);
describe('repository workspace', () => {
  it('blocks an incomplete export and makes an example editable without claiming a repair', () => {
    renderDesk();
    expect(screen.getByRole('button', { name: 'Export repair request' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Load a checkout example/ }));
    expect(screen.getByRole('button', { name: 'Export repair request' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Behavior to fix' }).hasAttribute('readonly')).toBe(false);
    expect(screen.getByText(/It has not been repaired or executed/)).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });
  it('saves a request, restores it across remounts, and supports removal and undo', () => {
    const first = renderDesk();
    fireEvent.click(screen.getByRole('button', { name: /Load a checkout example/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to queue' }));
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY)!)).toHaveLength(1);
    first.unmount(); renderDesk();
    expect((screen.getByRole('textbox', { name: 'Issue title' }) as HTMLInputElement).value).toBe('Discount totals round inconsistently');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Discount totals round inconsistently' }));
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY)!)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo removal' }));
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY)!)).toHaveLength(1);
  });
  it('makes removing every source from edit scope block export', () => {
    renderDesk();
    fireEvent.click(screen.getByRole('button', { name: /Load a checkout example/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'src/discounts.py' }));
    expect(screen.getByRole('button', { name: 'Export repair request' }).hasAttribute('disabled')).toBe(true);
    expect(register).not.toHaveBeenCalled();
  });
  it('preserves work and explains a storage failure', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderDesk();
    fireEvent.click(screen.getByRole('button', { name: /Load a checkout example/ }));
    expect(screen.getByRole('alert').textContent).toContain('Browser storage is unavailable');
    expect(screen.getByRole('button', { name: 'Export repair request' }).hasAttribute('disabled')).toBe(false);
    spy.mockRestore();
  });
});
