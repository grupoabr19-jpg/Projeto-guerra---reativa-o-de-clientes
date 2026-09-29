routerAdd(
  'POST',
  '/backend/v1/kommo/test',
  (e) => {
    try {
      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''

      if (!subdomain || !accessToken) {
        return e.json(200, {
          ok: false,
          status: 'error',
          message:
            'Credenciais ausentes: configure KOMMO_SUBDOMAIN e KOMMO_ACCESS_TOKEN nas variáveis de ambiente do backend.',
          testedAt: new Date().toISOString(),
        })
      }

      const apiUrl = `https://${subdomain}.kommo.com/api/v4/account`
      const res = $http.send({
        url: apiUrl,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10,
      })

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return e.json(200, {
          ok: true,
          status: 'connected',
          message: 'Conexão com a API do Kommo estabelecida com sucesso!',
          account: res.json?.name || subdomain,
          testedAt: new Date().toISOString(),
        })
      } else {
        return e.json(200, {
          ok: false,
          status: 'error',
          statusCode: res.statusCode,
          message: `Falha na autenticação Kommo (HTTP ${res.statusCode}): Verifique se o token é válido ou se expirou.`,
          testedAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      return e.json(200, {
        ok: false,
        status: 'error',
        message: `Erro ao conectar com Kommo: ${err.message}`,
        testedAt: new Date().toISOString(),
      })
    }
  },
  $apis.requireAuth(),
)
