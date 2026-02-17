import { FC, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ConsultationIntake,
  ConsultationType,
  PersonSex,
} from '../types'
import './ConsultationIntakeForm.css'

type SexSelection = PersonSex | ''

interface PersonFormState {
  nomeCompleto: string
  dataNascimento: string
  sexo: SexSelection
}

interface ConsultationIntakeFormProps {
  initialValue?: ConsultationIntake | null
  onSubmit: (intake: ConsultationIntake) => void
  onBack: () => void
}

interface FormErrors {
  pessoa1Nome?: string
  pessoa1Sexo?: string
  pessoa2Nome?: string
  pessoa2Sexo?: string
  situacaoPrincipal?: string
}

interface IntakeDraftState {
  tipo: ConsultationType
  pessoa1: PersonFormState
  pessoa2: PersonFormState
  situacaoPrincipal: string
}

const INTAKE_DRAFT_STORAGE_KEY = 'taro.intake.draft.v1'
const toUppercaseInput = (value: string) => value.toLocaleUpperCase('pt-BR')

const getPersonState = (
  source?: ConsultationIntake['pessoa1'] | ConsultationIntake['pessoa2'] | null,
): PersonFormState => ({
  nomeCompleto: source?.nomeCompleto ? toUppercaseInput(source.nomeCompleto) : '',
  dataNascimento: source?.dataNascimento || '',
  sexo: source?.sexo || '',
})

const ConsultationIntakeForm: FC<ConsultationIntakeFormProps> = ({
  initialValue,
  onSubmit,
  onBack,
}) => {
  const [tipo, setTipo] = useState<ConsultationType>(initialValue?.tipo || 'pessoal')
  const [pessoa1, setPessoa1] = useState<PersonFormState>(getPersonState(initialValue?.pessoa1))
  const [pessoa2, setPessoa2] = useState<PersonFormState>(getPersonState(initialValue?.pessoa2))
  const [situacaoPrincipal, setSituacaoPrincipal] = useState(
    initialValue?.situacaoPrincipal || '',
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const draftSaveTimerRef = useRef<number | null>(null)
  const lastDraftRef = useRef('')

  const title = useMemo(
    () => (tipo === 'pessoal' ? 'Roteiro Inicial - Pessoal' : 'Roteiro Inicial - Sobre Outra Pessoa'),
    [tipo],
  )

  useEffect(() => {
    if (initialValue) {
      setTipo(initialValue.tipo)
      setPessoa1(getPersonState(initialValue.pessoa1))
      setPessoa2(getPersonState(initialValue.pessoa2))
      setSituacaoPrincipal(toUppercaseInput(initialValue.situacaoPrincipal || ''))
      return
    }

    try {
      const raw = localStorage.getItem(INTAKE_DRAFT_STORAGE_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as IntakeDraftState

      setTipo(draft.tipo || 'pessoal')
      setPessoa1({
        ...(draft.pessoa1 || getPersonState()),
        nomeCompleto: toUppercaseInput(draft.pessoa1?.nomeCompleto || ''),
      })
      setPessoa2({
        ...(draft.pessoa2 || getPersonState()),
        nomeCompleto: toUppercaseInput(draft.pessoa2?.nomeCompleto || ''),
      })
      setSituacaoPrincipal(toUppercaseInput(draft.situacaoPrincipal || ''))
    } catch (error) {
      console.error('Falha ao restaurar rascunho do formulário:', error)
    }
  }, [initialValue])

  useEffect(() => {
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current)
    }

    const draft: IntakeDraftState = {
      tipo,
      pessoa1,
      pessoa2,
      situacaoPrincipal,
    }

    const serialized = JSON.stringify(draft)
    if (serialized === lastDraftRef.current) return
    lastDraftRef.current = serialized

    draftSaveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(INTAKE_DRAFT_STORAGE_KEY, serialized)
      } catch (error) {
        console.error('Falha ao salvar rascunho do formulário:', error)
      }
    }, 280)

    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current)
      }
    }
  }, [pessoa1, pessoa2, situacaoPrincipal, tipo])

  const validate = () => {
    const nextErrors: FormErrors = {}

    if (!pessoa1.nomeCompleto.trim()) {
      nextErrors.pessoa1Nome = 'Informe o nome completo da Pessoa 1.'
    }

    if (!pessoa1.sexo) {
      nextErrors.pessoa1Sexo = 'Selecione o sexo da Pessoa 1.'
    }

    if (tipo === 'sobre-outra-pessoa') {
      if (!pessoa2.nomeCompleto.trim()) {
        nextErrors.pessoa2Nome = 'Informe o nome completo da Pessoa 2.'
      }

      if (!pessoa2.sexo) {
        nextErrors.pessoa2Sexo = 'Selecione o sexo da Pessoa 2.'
      }
    }

    if (!situacaoPrincipal.trim()) {
      nextErrors.situacaoPrincipal = 'Descreva a principal situação que trouxe o cliente aqui hoje.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validate()) return

    const intake: ConsultationIntake = {
      tipo,
      pessoa1: {
        nomeCompleto: pessoa1.nomeCompleto.trim(),
        dataNascimento: pessoa1.dataNascimento || undefined,
        sexo: pessoa1.sexo as PersonSex,
      },
      pessoa2:
        tipo === 'sobre-outra-pessoa'
          ? {
              nomeCompleto: pessoa2.nomeCompleto.trim(),
              dataNascimento: pessoa2.dataNascimento || undefined,
              sexo: pessoa2.sexo as PersonSex,
            }
          : null,
      situacaoPrincipal: situacaoPrincipal.trim(),
      createdAt: initialValue?.createdAt || Date.now(),
    }

    localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY)
    lastDraftRef.current = ''
    onSubmit(intake)
  }

  return (
    <form className="intake-form" onSubmit={handleSubmit}>
      <h2>{title}</h2>
      <p className="intake-intro">
        Preencha estes dados antes de escolher a tiragem. O app usará estas
        informações para personalizar a síntese final e o conselho.
      </p>

      <div className="intake-type-selector">
        <button
          type="button"
          className={tipo === 'pessoal' ? 'active' : ''}
          onClick={() => setTipo('pessoal')}
        >
          1 - Pessoal
        </button>
        <button
          type="button"
          className={tipo === 'sobre-outra-pessoa' ? 'active' : ''}
          onClick={() => setTipo('sobre-outra-pessoa')}
        >
          2 - Sobre outra pessoa
        </button>
      </div>

      <section className="intake-section">
        <h3>Pessoa 1</h3>

        <label>
          Nome completo (Pessoa 1) *
          <input
            type="text"
            value={pessoa1.nomeCompleto}
            onChange={event => {
              const value = toUppercaseInput(event.target.value)
              setPessoa1(prev => ({ ...prev, nomeCompleto: value }))
            }}
            placeholder="Digite o nome completo"
            required
          />
          {errors.pessoa1Nome && <small>{errors.pessoa1Nome}</small>}
        </label>

        <label>
          Data de nascimento (opcional)
          <input
            type="date"
            value={pessoa1.dataNascimento}
            onChange={event => {
              const value = event.target.value
              setPessoa1(prev => ({ ...prev, dataNascimento: value }))
            }}
          />
        </label>

        <label>
          Sexo *
          <select
            value={pessoa1.sexo}
            onChange={event => {
              const value = event.target.value as SexSelection
              setPessoa1(prev => ({ ...prev, sexo: value }))
            }}
            required
          >
            <option value="">Selecione</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
          </select>
          {errors.pessoa1Sexo && <small>{errors.pessoa1Sexo}</small>}
        </label>
      </section>

      {tipo === 'sobre-outra-pessoa' && (
        <section className="intake-section">
          <h3>Pessoa 2</h3>

          <label>
            Nome completo (Pessoa 2) *
            <input
              type="text"
              value={pessoa2.nomeCompleto}
              onChange={event => {
                const value = toUppercaseInput(event.target.value)
                setPessoa2(prev => ({ ...prev, nomeCompleto: value }))
              }}
              placeholder="Digite o nome completo"
              required
            />
            {errors.pessoa2Nome && <small>{errors.pessoa2Nome}</small>}
          </label>

          <label>
            Data de nascimento (opcional)
            <input
              type="date"
              value={pessoa2.dataNascimento}
              onChange={event => {
                const value = event.target.value
                setPessoa2(prev => ({ ...prev, dataNascimento: value }))
              }}
            />
          </label>

          <label>
            Sexo *
            <select
              value={pessoa2.sexo}
              onChange={event => {
                const value = event.target.value as SexSelection
                setPessoa2(prev => ({ ...prev, sexo: value }))
              }}
              required
            >
              <option value="">Selecione</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
            </select>
            {errors.pessoa2Sexo && <small>{errors.pessoa2Sexo}</small>}
          </label>
        </section>
      )}

      <section className="intake-section">
        <label>
          Qual é a principal situação que te trouxe aqui hoje? *
          <textarea
            value={situacaoPrincipal}
            onChange={event => setSituacaoPrincipal(toUppercaseInput(event.target.value))}
            placeholder="Ex: Quero entender os próximos passos no relacionamento e no trabalho."
            required
          />
          {errors.situacaoPrincipal && <small>{errors.situacaoPrincipal}</small>}
        </label>
      </section>

      <div className="intake-actions">
        <button type="button" className="secondary" onClick={onBack}>
          Voltar ao menu
        </button>
        <button type="submit">Registrar dados e escolher tiragem</button>
      </div>
    </form>
  )
}

export default ConsultationIntakeForm
