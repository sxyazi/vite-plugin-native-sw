const API_ENTRY = '/news'

export const News = () => {
	const [list, setList] = useState<{ title: string }[]>([])

	useEffect(() => {
		fetch(API_ENTRY, {headers: {'x-swr': '1'}})
			.then(resp => resp.json())
			.then(setList)
	}, [])

	useEffect(() => {
		const onMessage = ({data}: MessageEvent) => {
			if (data.type !== 'REFRESH') return
			if (data.path === API_ENTRY)
				setList(JSON.parse(new TextDecoder().decode(data.buf)))
		}

		navigator.serviceWorker?.addEventListener('message', onMessage)
		return () => navigator.serviceWorker?.removeEventListener('message', onMessage)

	}, [])

	return (
		<ul>
			{list.map(news => <li>{news.title}</li>)}
		</ul>
	)
}
