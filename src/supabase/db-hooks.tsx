'use client';

import { useEffect, useState, useMemo, DependencyList } from 'react';
import { supabase } from './config';

export interface MockRef {
  type: 'doc' | 'collection' | 'query';
  path: string;
}

export function doc(db: any, path: string, ...segments: string[]): MockRef {
  const fullPath = [path, ...segments].filter(Boolean).join('/');
  return { type: 'doc', path: fullPath };
}

export function collection(db: any, path: string, ...segments: string[]): MockRef {
  const fullPath = [path, ...segments].filter(Boolean).join('/');
  return { type: 'collection', path: fullPath };
}

export function query(ref: MockRef, ...constraints: any[]): MockRef {
  return { type: 'query', path: ref.path };
}

// Map path to table and ID
export function parsePath(path: string) {
  const parts = path.split('/').filter(Boolean);
  
  if (parts.length === 2 && parts[0] === 'students') {
    return { table: 'students', id: parts[1], keyField: 'id' };
  }
  if (parts[0] === 'students' && parts[2] === 'signatures') {
    return { table: 'signatures', id: parts[3], studentId: parts[1], keyField: 'id' };
  }
  if (parts[0] === 'students' && parts[2] === 'thankYouCards') {
    return { table: 'thank_you_cards', id: parts[3], studentId: parts[1], keyField: 'id' };
  }
  if (parts[0] === 'students' && parts[2] === 'signedIps') {
    return { table: 'signed_ips', ipAddress: parts[3], studentId: parts[1], keyField: 'studentId' };
  }
  
  return { table: parts[0] || '', id: parts[1], keyField: 'id' };
}

export async function getDoc(ref: MockRef) {
  const parsed = parsePath(ref.path);
  
  let q = supabase.from(parsed.table).select('*');
  
  if (parsed.table === 'signed_ips') {
    q = q.eq('studentId', parsed.studentId).eq('ipAddress', parsed.ipAddress);
  } else {
    q = q.eq(parsed.keyField || 'id', parsed.id);
  }
  
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("Error in getDoc:", error);
    throw error;
  }
  
  return {
    exists: () => !!data,
    data: () => data,
    id: parsed.id || '',
  };
}

export function useDoc<T = any>(
  docRef: MockRef | null | undefined
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setData(null);
    setError(null);

    if (!docRef) {
      setIsLoading(false);
      return;
    }

    const parsed = parsePath(docRef.path);

    const fetchDoc = async () => {
      try {
        const { data: row, error: fetchErr } = await supabase
          .from(parsed.table)
          .select('*')
          .eq(parsed.keyField || 'id', parsed.id)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        
        if (row) {
          setData({ ...row, id: parsed.id } as T);
        } else {
          setData(null);
        }
      } catch (err: any) {
        console.error("useDoc fetch error:", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDoc();

    const channel = supabase
      .channel(`doc-${parsed.table}-${parsed.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: parsed.table,
          filter: `${parsed.keyField || 'id'}=eq.${parsed.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setData(null);
          } else {
            setData({ ...payload.new, id: parsed.id } as T);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [docRef?.path]);

  return { data, isLoading, error };
}

export function useCollection<T = any>(
  targetRefOrQuery: MockRef | null | undefined
) {
  const [data, setData] = useState<(T & { id: string })[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setData(null);
    setError(null);

    if (!targetRefOrQuery) {
      setIsLoading(false);
      return;
    }

    const parsed = parsePath(targetRefOrQuery.path);

    const fetchCollection = async () => {
      try {
        let q = supabase.from(parsed.table).select('*');
        
        if (parsed.studentId) {
          q = q.eq('studentId', parsed.studentId);
        }

        const { data: rows, error: fetchErr } = await q;
        if (fetchErr) throw fetchErr;

        setData((rows || []).map(row => ({ ...row, id: row.id })) as (T & { id: string })[]);
      } catch (err: any) {
        console.error("useCollection fetch error:", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCollection();

    const channel = supabase
      .channel(`col-${parsed.table}-${parsed.studentId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: parsed.table,
          filter: parsed.studentId ? `studentId=eq.${parsed.studentId}` : undefined,
        },
        () => {
          fetchCollection();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetRefOrQuery?.path]);

  return { data, isLoading, error };
}

export function setDocumentNonBlocking(docRef: MockRef, data: any, options?: { merge?: boolean }) {
  const parsed = parsePath(docRef.path);
  
  const execute = async () => {
    if (parsed.table === 'students') {
      const payload = {
        id: parsed.id,
        name: data.name,
        email: data.email,
        profilePhotoUrl: data.profilePhotoUrl,
        pageSettings: data.pageSettings,
        popupMessageConfig: data.popupMessageConfig,
        ...(options?.merge ? {} : { createdAt: new Date().toISOString() })
      };
      
      Object.keys(payload).forEach(key => (payload as any)[key] === undefined && delete (payload as any)[key]);
      
      if (options?.merge) {
        const { error } = await supabase.from('students').update(payload).eq('id', parsed.id);
        if (error) console.error("Error setting document:", error);
      } else {
        const { error } = await supabase.from('students').upsert(payload);
        if (error) console.error("Error setting document:", error);
      }
    } else {
      const payload = { id: parsed.id, ...data };
      if (options?.merge) {
        const { error } = await supabase.from(parsed.table).update(data).eq(parsed.keyField || 'id', parsed.id);
        if (error) console.error("Error setting document:", error);
      } else {
        const { error } = await supabase.from(parsed.table).upsert(payload);
        if (error) console.error("Error setting document:", error);
      }
    }
  };

  execute();
}

export function updateDocumentNonBlocking(docRef: MockRef, data: any) {
  const parsed = parsePath(docRef.path);
  
  const execute = async () => {
    const { error } = await supabase
      .from(parsed.table)
      .update(data)
      .eq(parsed.keyField || 'id', parsed.id);
    if (error) console.error("Error updating document:", error);
  };

  execute();
}

export function addDocumentNonBlocking(colRef: MockRef, data: any) {
  const parsed = parsePath(colRef.path);
  
  const execute = async () => {
    const { data: inserted, error } = await supabase
      .from(parsed.table)
      .insert(data)
      .select()
      .single();
    if (error) {
      console.error("Error adding document:", error);
      throw error;
    }
    return { id: inserted.id };
  };

  return execute();
}

export function deleteDocumentNonBlocking(docRef: MockRef) {
  const parsed = parsePath(docRef.path);
  
  const execute = async () => {
    const { error } = await supabase
      .from(parsed.table)
      .delete()
      .eq(parsed.keyField || 'id', parsed.id);
    if (error) console.error("Error deleting document:", error);
  };

  execute();
}

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T {
  return useMemo(factory, deps);
}
