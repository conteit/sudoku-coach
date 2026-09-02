import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitLayout } from './SplitLayout';

const panes = { left: <p>the left</p>, right: <p>the right</p> };

describe('SplitLayout', () => {
  it('splits, left before right in the DOM', () => {
    render(<SplitLayout {...panes} />);
    const left = screen.getByTestId('left-pane');
    const right = screen.getByTestId('right-pane');
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pins the left pane so its neighbour cannot squeeze it', () => {
    render(<SplitLayout {...panes} />);
    const cls = screen.getByTestId('left-pane').className;
    // The width class is asserted alongside the other two: the comment in
    // `SplitLayout` argues for all three together, and a mutant dropping
    // `w-[20rem]` — leaving a pane that shrink-wraps its content — passed
    // when only `shrink-0` and `min-w-0` were checked.
    expect(cls).toContain('w-[20rem]');
    expect(cls).toContain('shrink-0');
    expect(cls).toContain('min-w-0');
  });

  it('adds no landmarks of its own — each screen owns its own semantics', () => {
    render(<SplitLayout {...panes} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
