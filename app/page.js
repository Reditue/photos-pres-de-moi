'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { MapPin, Upload, User, Heart, LogOut, X, Menu } from 'lucide-react'

export default function Home() {
  // États
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState([])
  const [userLocation, setUserLocation] = useState(null)
  const [selectedRadius, setSelectedRadius] = useState(1000)
  const [currentView, setCurrentView] = useState('feed')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [gdprConsent, setGdprConsent] = useState(false)

  // Formulaires
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [photoTitle, setPhotoTitle] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [uploadRadius, setUploadRadius] = useState(1000)
  const [imagePreview, setImagePreview] = useState(null)

  // Initialisation
  useEffect(() => {
    checkUser()
    checkGDPRConsent()
    loadPhotos()
  }, [])

  useEffect(() => {
    if (userLocation) {
      loadPhotos()
    }
  }, [userLocation, selectedRadius])

  // Vérifier l'utilisateur connecté
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    setLoading(false)
  }

  // Vérifier le consentement RGPD
  const checkGDPRConsent = () => {
    const consent = localStorage.getItem('gdprConsent')
    if (consent === 'true') {
      setGdprConsent(true)
      requestLocation()
    }
  }

  const acceptGDPR = () => {
    localStorage.setItem('gdprConsent', 'true')
    setGdprConsent(true)
    requestLocation()
  }

  // Demander la géolocalisation
  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          })
        },
        (error) => {
          console.error('Erreur géolocalisation:', error)
          setUserLocation({ lat: 48.8566, lon: 2.3522 }) // Paris par défaut
        }
      )
    }
  }

  // Charger les photos
  const loadPhotos = async () => {
    if (!userLocation) return

    try {
      const { data, error } = await supabase
        .from('photos')
        .select(`
          *,
          photo_likes(count)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Filtrer par distance
      const photosWithDistance = data.map(photo => {
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lon,
          photo.latitude,
          photo.longitude
        )
        return {
          ...photo,
          distance,
          likes: photo.photo_likes[0]?.count || 0
        }
      })
      .filter(photo => photo.distance <= selectedRadius)
      .sort((a, b) => a.distance - b.distance)

      setPhotos(photosWithDistance)
    } catch (error) {
      console.error('Erreur chargement photos:', error)
    }
  }

  // Calculer la distance
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

    return R * c
  }

  // Inscription
  const handleSignUp = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      })
      if (error) throw error
      alert('Vérifiez votre email pour confirmer votre inscription !')
      setShowAuthModal(false)
    } catch (error) {
      alert(error.message)
    }
  }

  // Connexion
  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error
      setShowAuthModal(false)
      checkUser()
    } catch (error) {
      alert(error.message)
    }
  }

  // Déconnexion
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  // Upload photo
  const handleUploadPhoto = async (e) => {
    e.preventDefault()
    if (!user || !photoFile || !userLocation) {
      alert('Connectez-vous et activez la géolocalisation')
      return
    }

    try {
      // Upload image
      const fileExt = photoFile.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, photoFile)

      if (uploadError) throw uploadError

      // Obtenir l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName)

      // Créer l'entrée dans la base
      const { error: dbError } = await supabase
        .from('photos')
        .insert({
          user_id: user.id,
          title: photoTitle,
          image_url: publicUrl,
          latitude: userLocation.lat,
          longitude: userLocation.lon,
          radius_meters: uploadRadius
        })

      if (dbError) throw dbError

      alert('Photo publiée avec succès !')
      setShowUploadModal(false)
      setPhotoTitle('')
      setPhotoFile(null)
      setImagePreview(null)
      loadPhotos()
    } catch (error) {
      alert('Erreur : ' + error.message)
    }
  }

  // Preview image
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  // Toggle like
  const toggleLike = async (photoId) => {
    if (!user) {
      alert('Connectez-vous pour liker')
      return
    }

    try {
      const { data: existingLike } = await supabase
        .from('photo_likes')
        .select()
        .eq('photo_id', photoId)
        .eq('user_id', user.id)
        .single()

      if (existingLike) {
        await supabase
          .from('photo_likes')
          .delete()
          .eq('photo_id', photoId)
          .eq('user_id', user.id)
      } else {
        await supabase
          .from('photo_likes')
          .insert({
            photo_id: photoId,
            user_id: user.id
          })
      }

      loadPhotos()
    } catch (error) {
      console.error('Erreur like:', error)
    }
  }

  // Format distance
  const formatDistance = (meters) => {
    if (meters < 1000) return Math.round(meters) + ' m'
    return (meters / 1000).toFixed(1) + ' km'
  }

  // Format time
  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor(diff / 60000)
    
    if (hours > 0) return `Il y a ${hours}h`
    if (minutes > 0) return `Il y a ${minutes}min`
    return 'À l\'instant'
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 sticky top-0 z-50 shadow-lg">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MapPin size={24} />
            Photos Près de Moi
          </h1>
          {user ? (
            <button onClick={handleLogout} className="p-2 hover:bg-blue-600 rounded-lg">
              <LogOut size={20} />
            </button>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold">
              Connexion
            </button>
          )}
        </div>
      </header>

      {/* Bannière RGPD */}
      {!gdprConsent && (
        <div className="fixed bottom-20 left-0 right-0 bg-white p-4 shadow-lg z-50">
          <p className="mb-3 text-sm"><strong>🍪 Protection de vos données</strong></p>
          <p className="mb-3 text-sm">Ce site utilise votre position uniquement pour afficher les photos proches.</p>
          <button onClick={acceptGDPR} className="bg-green-500 text-white px-6 py-2 rounded-lg font-semibold w-full">
            J'accepte
          </button>
        </div>
      )}

      {/* Filtres */}
      {currentView === 'feed' && (
        <div className="bg-white p-4 shadow">
          <label className="block font-semibold mb-2">📍 Rayon de recherche</label>
          <div className="flex gap-2">
            {[500, 1000, 5000].map(radius => (
              <button
                key={radius}
                onClick={() => setSelectedRadius(radius)}
                className={`flex-1 py-2 rounded-lg font-medium ${
                  selectedRadius === radius
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100'
                }`}
              >
                {radius < 1000 ? radius + 'm' : radius / 1000 + ' km'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feed */}
      {currentView === 'feed' && (
        <div className="p-4 space-y-4">
          {photos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <MapPin size={64} className="mx-auto mb-4 opacity-30" />
              <p>Aucune photo à proximité</p>
              <p className="text-sm">Soyez le premier à partager !</p>
            </div>
          ) : (
            photos.map(photo => (
              <div key={photo.id} className="bg-white rounded-xl shadow overflow-hidden">
                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-white font-bold">
                    {photo.user_id?.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">Utilisateur</div>
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      <MapPin size={14} />
                      {formatDistance(photo.distance)} · {formatTime(photo.created_at)}
                    </div>
                  </div>
                </div>
                <img src={photo.image_url} alt={photo.title} className="w-full h-72 object-cover" />
                <div className="p-4">
                  <p className="font-semibold mb-2">{photo.title}</p>
                  <button
                    onClick={() => toggleLike(photo.id)}
                    className="flex items-center gap-2 text-gray-600 hover:text-red-500"
                  >
                    <Heart size={20} />
                    <span>{photo.likes}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Auth */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">{authMode === 'login' ? 'Connexion' : 'Inscription'}</h2>
              <button onClick={() => setShowAuthModal(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp}>
              {authMode === 'signup' && (
                <input
                  type="text"
                  placeholder="Pseudo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-3 border-2 rounded-lg mb-3"
                  required
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border-2 rounded-lg mb-3"
                required
              />
              <input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border-2 rounded-lg mb-4"
                required
                minLength={6}
              />
              <button type="submit" className="w-full bg-blue-500 text-white py-3 rounded-lg font-bold hover:bg-blue-600">
                {authMode === 'login' ? 'Se connecter' : 'S\'inscrire'}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="w-full mt-3 text-blue-500 hover:underline"
              >
                {authMode === 'login' ? 'Créer un compte' : 'Déjà inscrit ? Se connecter'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Upload */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full my-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">📸 Publier une photo</h2>
              <button onClick={() => setShowUploadModal(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUploadPhoto}>
              <div className="mb-4">
                <label className="block font-semibold mb-2">Photo *</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 cursor-pointer">
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handleFileChange}
                    className="hidden"
                    id="photoInput"
                    required
                  />
                  <label htmlFor="photoInput" className="cursor-pointer">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                    ) : (
                      <>
                        <Upload size={48} className="mx-auto mb-2 text-gray-400" />
                        <p className="text-gray-600">Cliquez pour choisir une photo</p>
                        <p className="text-sm text-gray-400 mt-1">JPEG ou PNG, max 5 Mo</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="mb-4">
                <label className="block font-semibold mb-2">Titre / Légende</label>
                <textarea
                  value={photoTitle}
                  onChange={(e) => setPhotoTitle(e.target.value)}
                  placeholder="Décrivez votre photo..."
                  rows={3}
                  className="w-full p-3 border-2 rounded-lg"
                />
              </div>

              <div className="mb-4">
                <label className="block font-semibold mb-2">Rayon de visibilité</label>
                <div className="flex gap-2">
                  {[500, 1000, 5000].map(radius => (
                    <button
                      key={radius}
                      type="button"
                      onClick={() => setUploadRadius(radius)}
                      className={`flex-1 py-2 rounded-lg font-medium ${
                        uploadRadius === radius
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100'
                      }`}
                    >
                      {radius < 1000 ? radius + 'm' : radius / 1000 + ' km'}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="w-full bg-blue-500 text-white py-3 rounded-lg font-bold hover:bg-blue-600">
                Publier
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-lg flex justify-around py-3 z-40">
        <button
          onClick={() => setCurrentView('feed')}
          className={`flex flex-col items-center gap-1 px-6 ${
            currentView === 'feed' ? 'text-blue-500' : 'text-gray-500'
          }`}
        >
          <MapPin size={24} />
          <span className="text-xs">Accueil</span>
        </button>
        <button
          onClick={() => {
            if (!user) {
              setShowAuthModal(true)
            } else {
              setShowUploadModal(true)
            }
          }}
          className="flex flex-col items-center gap-1 px-6 text-gray-500"
        >
          <Upload size={24} />
          <span className="text-xs">Publier</span>
        </button>
        <button
          onClick={() => setCurrentView('profile')}
          className={`flex flex-col items-center gap-1 px-6 ${
            currentView === 'profile' ? 'text-blue-500' : 'text-gray-500'
          }`}
        >
          <User size={24} />
          <span className="text-xs">Profil</span>
        </button>
      </nav>
    </div>
  )
}