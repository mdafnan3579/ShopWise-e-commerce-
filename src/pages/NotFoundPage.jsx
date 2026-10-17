import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/ui.jsx';

export function NotFoundPage({ what = 'page' }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`We couldn’t find that ${what}`}
      action={
        <Link to="/products" className="btn-primary">
          Back to the shop
        </Link>
      }
    >
      It may have been moved or is no longer available.
    </EmptyState>
  );
}
