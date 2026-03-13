import React from 'react';

export function PeopleList({ title, people }) {
  if (!people?.length) return null;

  return (
    <section className="bg-white border border-neutral-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
      <h3 className="font-heading font-bold text-neutral-900">{title}</h3>
      <div className="flex flex-col gap-2">
        {people.map((person) => (
          <div
            key={person.id}
            className="border border-neutral-200 bg-neutral-50 rounded-xl px-4 py-3 flex items-center gap-3"
          >
            {person.avatar_url ? (
              <img
                src={person.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-rose-100 grid place-items-center text-rose-600 text-xs font-bold">
                {(person.full_name || person.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-neutral-900 text-sm truncate">
                {person.full_name || 'Unnamed'}
              </span>
              <span className="text-neutral-500 text-xs truncate">{person.email}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
