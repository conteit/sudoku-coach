import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitLayout } from './SplitLayout';

const panes = { left: <p>the left</p>, right: <p>the right</p> };
const NARROW = ['w-[20rem]', 'shrink-0', 'min-w-0'];

describe('SplitLayout', () => {
  it('splits, left before right in the DOM', () => {
    render(<SplitLayout narrow="left" {...panes} />);
    const left = screen.getByTestId('left-pane');
    const right = screen.getByTestId('right-pane');
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The width class is asserted alongside the other two: `SplitLayout`'s
  // comment argues for all three together, and a mutant dropping `w-[20rem]`
  // — leaving a pane that shrink-wraps its content — passed when only
  // `shrink-0` and `min-w-0` were checked.
  it('pins the left pane when the caller says left is narrow', () => {
    render(<SplitLayout narrow="left" {...panes} />);
    const cls = screen.getByTestId('left-pane').className;
    for (const token of NARROW) expect(cls).toContain(token);
    expect(screen.getByTestId('right-pane').className).toContain('flex-1');
  });

  it('pins the right pane instead when the caller says right is narrow', () => {
    // The library's case: main content wide *and* first in the DOM. Before
    // `narrow` existed it could only have one of the two, and it had the
    // wrong one — 320px of games on a laptop, against 343px on a phone.
    render(<SplitLayout narrow="right" {...panes} />);
    const cls = screen.getByTestId('right-pane').className;
    for (const token of NARROW) expect(cls).toContain(token);
    expect(screen.getByTestId('left-pane').className).toContain('flex-1');
    expect(screen.getByTestId('left-pane').className).not.toContain('w-[20rem]');
  });

  it('adds no landmarks of its own — each screen owns its own semantics', () => {
    render(<SplitLayout narrow="left" {...panes} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
