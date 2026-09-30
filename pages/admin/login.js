import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push('/admin');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong');
    }
  }

  return (
    <div className="admin-shell page">
      <Head>
        <title>Host sign in - Moment Share</title>
      </Head>
      <div className="container" style={{ paddingTop: 96 }}>
        <p className="eyebrow" style={{ color: '#e2a73b' }}>
          Moment Share
        </p>
        <h1 className="display" style={{ fontSize: 28, marginBottom: 24 }}>
          Host sign in
        </h1>
        <form onSubmit={handleSubmit} className="card">
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && (
            <p style={{ color: '#e2a73b', fontSize: 14, marginBottom: 12 }}>{error}</p>
          )}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
