import GameList from '../components/GameList'

export default function GameListPage(props) {
  return (
    <div style={{ padding: 16 }}>
      <GameList {...props} />
    </div>
  )
}
