import { useState } from 'react'
import { supabase } from './supabase'

function Login({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [error, setError] = useState(null)
  const [isSignUp, setIsSignUp] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Vérifier si l'utilisateur existe
      const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', username)
        .single()

      if (userError && userError.code !== 'PGRST116') {
        throw userError
      }

      if (isSignUp) {
        // Mode inscription
        if (existingUser) {
          setError('Ce nom d\'utilisateur est déjà pris')
          return
        }

        // Créer le nouvel utilisateur
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{ username }])
          .select()
          .single()

        if (createError) throw createError

        onLogin({
          id: newUser.id,
          username: newUser.username
        })
      } else {
        // Mode connexion
        if (!existingUser) {
          setError('Ce nom d\'utilisateur n\'existe pas')
          return
        }

        onLogin({
          id: existingUser.id,
          username: existingUser.username
        })
      }
    } catch (error) {
      console.error('Erreur:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#36393f'
    }}>
      <div style={{
        backgroundColor: '#2f3136',
        padding: '2rem',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '400px',
        color: '#dcddde'
      }}>
        <h1 style={{
          textAlign: 'center',
          marginBottom: '1rem',
          color: '#ffffff'
        }}>SachMS</h1>

        <div style={{
          display: 'flex',
          marginBottom: '2rem',
          backgroundColor: '#202225',
          borderRadius: '4px',
          padding: '0.25rem'
        }}>
          <button
            type="button"
            onClick={() => setIsSignUp(false)}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: !isSignUp ? '#5865f2' : 'transparent',
              color: !isSignUp ? '#ffffff' : '#b9bbbe',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(true)}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: isSignUp ? '#5865f2' : 'transparent',
              color: isSignUp ? '#ffffff' : '#b9bbbe',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: '#b9bbbe'
            }}>
              Nom d'utilisateur
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#40444b',
                border: 'none',
                borderRadius: '4px',
                color: '#dcddde',
                fontSize: '1rem'
              }}
            />
          </div>

          {error && (
            <div style={{
              color: '#f04747',
              textAlign: 'center',
              marginBottom: '1rem',
              backgroundColor: 'rgba(240, 71, 71, 0.1)',
              padding: '0.75rem',
              borderRadius: '4px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#5865f2',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Chargement...' : (isSignUp ? 'S\'inscrire' : 'Se connecter')}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login 