import { useCallback, useEffect, useState } from 'react'
import { dbService, DBService } from '../services/dbService'
import { SpreadingSession } from '../types'

const normalizeErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Erro desconhecido ao acessar o banco local.'

export const useIndexedDB = () => {
  const [db, setDb] = useState<DBService | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const initDB = async () => {
      try {
        await dbService.init()
        if (!isMounted) return
        setDb(dbService)
        setIsReady(true)
        setError(null)
      } catch (err) {
        const message = normalizeErrorMessage(err)
        console.error('Erro ao inicializar DB:', err)
        if (!isMounted) return
        setDb(null)
        setIsReady(false)
        setError(message)
      }
    }

    void initDB()

    return () => {
      isMounted = false
    }
  }, [])

  const saveSession = useCallback(
    async (session: SpreadingSession) => {
      if (!db) return
      try {
        await db.saveSession(session)
        setError(null)
      } catch (err) {
        const message = normalizeErrorMessage(err)
        console.error('Erro ao salvar sessão:', err)
        setError(message)
      }
    },
    [db],
  )

  const getSession = useCallback(
    async (id: string) => {
      if (!db) return null
      try {
        const session = await db.getSession(id)
        setError(null)
        return session
      } catch (err) {
        const message = normalizeErrorMessage(err)
        console.error('Erro ao obter sessão:', err)
        setError(message)
        return null
      }
    },
    [db],
  )

  const getAllSessions = useCallback(async () => {
    if (!db) return []
    try {
      const sessions = await db.getAllSessions()
      setError(null)
      return sessions
    } catch (err) {
      const message = normalizeErrorMessage(err)
      console.error('Erro ao obter sessões:', err)
      setError(message)
      return []
    }
  }, [db])

  const deleteSession = useCallback(
    async (id: string) => {
      if (!db) return
      try {
        await db.deleteSession(id)
        setError(null)
      } catch (err) {
        const message = normalizeErrorMessage(err)
        console.error('Erro ao deletar sessão:', err)
        setError(message)
      }
    },
    [db],
  )

  return {
    isReady,
    error,
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
  }
}
