import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  autoConfirm: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface UserFormData {
  email: string;
  name: string;
  password: string;
  role: 'SUPER_ADMIN' | 'MODERATOR';
  autoConfirm: boolean;
}

const emptyForm: UserFormData = {
  email: '',
  name: '',
  password: '',
  role: 'MODERATOR',
  autoConfirm: false,
};

export function Users() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [changePassword, setChangePassword] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: () => api.get(`/users?page=${page}&limit=20`).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (d: UserFormData) => api.post('/users', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserFormData> }) => api.patch(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Failed to update user'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: any) => alert(err.response?.data?.message ?? 'Failed to deactivate user'),
  });

  const openCreate = () => {
    setEditUser(null);
    setFormData(emptyForm);
    setChangePassword(false);
    setError('');
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      password: '',
      role: user.role as 'SUPER_ADMIN' | 'MODERATOR',
      autoConfirm: user.autoConfirm,
    });
    setChangePassword(false);
    setError('');
    setShowModal(true);
  };

  const handleSubmit = () => {
    setError('');
    if (editUser) {
      const update: Record<string, unknown> = { name: formData.name, role: formData.role, autoConfirm: formData.autoConfirm };
      if (changePassword && formData.password) update.password = formData.password;
      updateMutation.mutate({ id: editUser.id, data: update as any });
    } else {
      createMutation.mutate(formData);
    }
  };

  const roleBadge = (role: string) => {
    if (role === 'SUPER_ADMIN') return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">SUPER_ADMIN</span>
    );
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">MODERATOR</span>
    );
  };

  const users: User[] = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          New User
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">AutoConfirm</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Active</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Login</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{user.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">{roleBadge(user.role)}</td>
                  <td className="px-4 py-3">
                    {user.autoConfirm ? (
                      <span className="text-green-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.isActive ? (
                      <span className="text-green-600">Active</span>
                    ) : (
                      <span className="text-red-500">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => openEdit(user)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Edit
                    </button>
                    {user.isActive && (
                      <button
                        onClick={() => {
                          if (confirm(`Deactivate ${user.email}?`)) {
                            deactivateMutation.mutate(user.id);
                          }
                        }}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta && meta.pages > 1 && (
            <div className="px-4 py-3 border-t flex items-center gap-2 text-sm text-gray-600">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded border disabled:opacity-50">Prev</button>
              <span>Page {page} of {meta.pages}</span>
              <button disabled={page >= meta.pages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{editUser ? 'Edit User' : 'New User'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
              {!editUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    required
                  />
                </div>
              )}
              {editUser && (
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={changePassword} onChange={e => setChangePassword(e.target.checked)} />
                    Change password
                  </label>
                </div>
              )}
              {(!editUser || changePassword) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    minLength={8}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData(f => ({ ...f, role: e.target.value as 'SUPER_ADMIN' | 'MODERATOR' }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="MODERATOR">MODERATOR</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.autoConfirm}
                    onChange={e => setFormData(f => ({ ...f, autoConfirm: e.target.checked }))}
                  />
                  AutoConfirm (actions execute immediately)
                </label>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {editUser ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
