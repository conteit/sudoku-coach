import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitLayout } from './SplitLayout';

const panes = { left: <p>the left</p>, right: <p>the right</p> };

describe('SplitLayout', () => {
  it('stacks one column on a phone', () => {
    render(<SplitLayout tier="phone" {...panes} />);
    expect(screen.getByText('the left')).toBeTruthy();
    expect(screen.getByText('the right')).toBeTruthy();
    expect(screen.queryByTestId('left-pane')).toBeNull();
  });

  it('stacks on a tablet too — two columns there are worse than one', () => {
    render(<SplitLayout tier="tablet" {...panes} />);
    expect(screen.queryByTestId('left-pane')).toBeNull();
  });

  it('splits at laptop, left before right in the DOM', () => {
    render(<SplitLayout tier="laptop" {...panes} />);
    const left = screen.getByTestId('left-pane');
    const right = screen.getByTestId('right-pane');
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pins the left pane so its neighbour cannot squeeze it', () => {
    render(<SplitLayout tier="desktop" {...panes} />);
    const cls = screen.getByTestId('left-pane').className;
    expect(cls).toContain('shrink-0');
    expect(cls).toContain('min-w-0');
  });

  it('adds no landmarks of its own — each screen owns its own semantics', () => {
    render(<SplitLayout tier="laptop" {...panes} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
