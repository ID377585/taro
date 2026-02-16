import { useCallback, useEffect, useState } from 'react'
import { dbService, DBService } from '../services/dbService'
import { SpreadingSession } from '../types'

export const useIndexedDB = () => {
  const [db, setDb] = useState<DBService | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const initDB = async () => {
      try {
        await dbService.init()
        setDb(dbService)
        setIsReady(true)
      } catch (err) {
        console.error('Erro ao inicializar DB:', err)
      }
    }

    initDB()
  }, [])

  const saveSession = useCallback(
    async (session: SpreadingSession) => {
      if (!db) return
      try {
        await db.saveSession(session)
      } catch (err) {
        console.error('Erro ao salvar sessão:', err)
      }
    },
    [db],
  )

  const getSession = useCallback(
    async (id: string) => {
      if (!db) return null
      try {
        return await db.getSession(id)
      } catch (err) {
        console.error('Erro ao obter sessão:', err)
        return null
      }
    },
    [db],
  )

  const getAllSessions = useCallback(async () => {
    if (!db) return []
    try {
      return await db.getAllSessions()
    } catch (err) {
      console.error('Erro ao obter sessões:', err)
      return []
    }
  }, [db])

  const deleteSession = useCallback(
    async (id: string) => {
      if (!db) return
      try {
        await db.deleteSession(id)
      } catch (err) {
        console.error('Erro ao deletar sessão:', err)
      }
    },
    [db],
  )

  return {
    isReady,
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
  }
}
